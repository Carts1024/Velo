import { Redis } from "@upstash/redis";

import { env } from "../_generated/server";

// Same-region Redis is normally single-digit milliseconds, but the first REST
// request after an idle period can include connection/serverless wake-up cost.
// Keep a strict cap while allowing that measured cold path to complete within
// the 350 ms create p95 budget.
export const EXTERNAL_CALL_DEADLINE_MS = 250;
export const ADMISSION_TTL_MS = 2 * 60 * 1_000;
export const BUCKET_TTL_MS = 10 * 60 * 1_000;

export const API_KEY_LIMIT = { capacity: 200, refillPerSecond: 60 } as const;
export const PROJECT_LIMIT = { capacity: 300, refillPerSecond: 100 } as const;

// Redis TIME keeps all callers on a single clock. The two token buckets and the
// retry admission record are evaluated in one script, so both scopes consume or
// neither scope consumes.
export const PAYMENT_ADMISSION_LUA = String.raw`
local admission = redis.call("HMGET", KEYS[1], "fingerprint", "allowed", "limit", "remaining", "retryAfterMs")
if admission[1] then
  if admission[1] ~= ARGV[1] then
    return {"fingerprint_conflict", 0, 0, 0, 0}
  end
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
  return {"replay", tonumber(admission[2]), tonumber(admission[3]), tonumber(admission[4]), tonumber(admission[5])}
end

local time = redis.call("TIME")
local nowMs = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)

local function refill(key, capacity, refillPerSecond)
  local bucket = redis.call("HMGET", key, "tokens", "updatedAt")
  local tokens = capacity
  local updatedAt = nowMs
  if bucket[1] then
    tokens = math.min(capacity, tonumber(bucket[1]) + ((nowMs - tonumber(bucket[2])) / 1000) * refillPerSecond)
  end
  return tokens, updatedAt
end

local apiCapacity = tonumber(ARGV[3])
local apiRefill = tonumber(ARGV[4])
local projectCapacity = tonumber(ARGV[5])
local projectRefill = tonumber(ARGV[6])
local apiTokens, apiUpdatedAt = refill(KEYS[2], apiCapacity, apiRefill)
local projectTokens, projectUpdatedAt = refill(KEYS[3], projectCapacity, projectRefill)
local allowed = apiTokens >= 1 and projectTokens >= 1

if allowed then
  apiTokens = apiTokens - 1
  projectTokens = projectTokens - 1
end

redis.call("HSET", KEYS[2], "tokens", apiTokens, "updatedAt", apiUpdatedAt)
redis.call("HSET", KEYS[3], "tokens", projectTokens, "updatedAt", projectUpdatedAt)
redis.call("PEXPIRE", KEYS[2], ARGV[7])
redis.call("PEXPIRE", KEYS[3], ARGV[7])

local retryAfterMs = 0
if not allowed then
  if apiTokens < 1 then
    retryAfterMs = math.max(retryAfterMs, math.ceil(((1 - apiTokens) / apiRefill) * 1000))
  end
  if projectTokens < 1 then
    retryAfterMs = math.max(retryAfterMs, math.ceil(((1 - projectTokens) / projectRefill) * 1000))
  end
end

local limit = math.min(apiCapacity, projectCapacity)
local remaining = math.max(0, math.floor(math.min(apiTokens, projectTokens)))
local allowedNumber = allowed and 1 or 0
redis.call("HSET", KEYS[1], "fingerprint", ARGV[1], "allowed", allowedNumber, "limit", limit, "remaining", remaining, "retryAfterMs", retryAfterMs)
redis.call("PEXPIRE", KEYS[1], ARGV[2])
return {"fresh", allowedNumber, limit, remaining, retryAfterMs}
`;

type AdmissionResult =
  | {
      status: "ok";
      allowed: boolean;
      limit: number;
      remaining: number;
      retryAfterMs: number;
      replayed: boolean;
      redisMs: number;
    }
  | { status: "fingerprint_conflict"; redisMs: number }
  | { status: "unavailable"; retryAfterMs: number; redisMs: number };

const encoder = new TextEncoder();
let cachedHmacSecret: string | undefined;
let cachedHmacKey: Promise<CryptoKey> | undefined;

function hmacKey(secret: string) {
  if (secret !== cachedHmacSecret || !cachedHmacKey) {
    cachedHmacSecret = secret;
    cachedHmacKey = globalThis.crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return cachedHmacKey;
}

async function hmac(value: string, secret: string) {
  const key = await hmacKey(secret);
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid numeric Redis limiter result");
  return parsed;
}

function safeErrorDetails(error: unknown) {
  const primary = error instanceof Error ? error : undefined;
  const causeValue =
    primary && "cause" in primary ? (primary as Error & { cause?: unknown }).cause : undefined;
  const cause = causeValue instanceof Error ? causeValue : undefined;
  return {
    name: primary?.name ?? "UnknownError",
    message: primary?.message.slice(0, 200) ?? "Unknown error",
    ...(cause
      ? {
          causeName: cause.name,
          causeMessage: cause.message.slice(0, 200),
        }
      : {}),
  };
}

export async function consumeUpstashPaymentAdmission(args: {
  apiKeyHash: string;
  projectId: string;
  admissionId: string;
  fingerprint: string;
}): Promise<AdmissionResult> {
  const startedAt = Date.now();
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const secret = env.VELO_RATE_LIMIT_SCOPE_SECRET;
  if (!url || !token || !secret || encoder.encode(secret).byteLength < 32) {
    return { status: "unavailable", retryAfterMs: 1_000, redisMs: Date.now() - startedAt };
  }

  try {
    const [apiScope, projectScope, admissionScope] = await Promise.all([
      hmac(`api:${args.apiKeyHash}`, secret),
      hmac(`project:${args.projectId}`, secret),
      hmac(`admission:${args.admissionId}`, secret),
    ]);
    // Passing a function tells the Upstash client to propagate an aborted fetch
    // instead of converting it into a synthetic successful Response. Reuse the
    // same signal so the retry remains inside one strict overall deadline.
    const deadlineSignal = AbortSignal.timeout(EXTERNAL_CALL_DEADLINE_MS);
    const redis = new Redis({
      url,
      token,
      signal: () => deadlineSignal,
      retry: { retries: 1, backoff: () => 0 },
      enableTelemetry: false,
      responseEncoding: false,
    });
    const hashSlot = `{${projectScope}}`;
    const result = await redis.eval<unknown[]>(
      PAYMENT_ADMISSION_LUA,
      [
        `velo:${hashSlot}:admission:${apiScope}:${admissionScope}`,
        `velo:${hashSlot}:api:${apiScope}`,
        `velo:${hashSlot}:project`,
      ],
      [
        args.fingerprint,
        String(ADMISSION_TTL_MS),
        String(API_KEY_LIMIT.capacity),
        String(API_KEY_LIMIT.refillPerSecond),
        String(PROJECT_LIMIT.capacity),
        String(PROJECT_LIMIT.refillPerSecond),
        String(BUCKET_TTL_MS),
      ],
    );
    if (!Array.isArray(result) || result.length !== 5)
      throw new Error("Invalid Redis limiter result");
    const status = String(result[0]);
    const redisMs = Date.now() - startedAt;
    if (status === "fingerprint_conflict") return { status, redisMs };
    if (status !== "fresh" && status !== "replay") throw new Error("Unknown Redis limiter status");
    return {
      status: "ok",
      allowed: asNumber(result[1]) === 1,
      limit: asNumber(result[2]),
      remaining: asNumber(result[3]),
      retryAfterMs: asNumber(result[4]),
      replayed: status === "replay",
      redisMs,
    };
  } catch (error) {
    console.error("velo.rate_limit.upstash_unavailable", {
      ...safeErrorDetails(error),
      durationMs: Date.now() - startedAt,
    });
    return { status: "unavailable", retryAfterMs: 1_000, redisMs: Date.now() - startedAt };
  }
}
