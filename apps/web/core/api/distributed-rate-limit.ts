import { api } from "@repo/backend/convex/_generated/api.js";
import { ConvexHttpClient } from "convex/browser";

export type DistributedRateLimit = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

export function distributedRateLimitHeaders(result: DistributedRateLimit) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    ...(result.retryAfterMs > 0
      ? { "Retry-After": String(Math.max(1, Math.ceil(result.retryAfterMs / 1_000))) }
      : {}),
  };
}

const MAX_OCC_RETRIES = 6;
const BASE_DELAY_MS = 50;

function isOccError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("OptimisticConcurrencyControlFailure");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function consumeDistributedRateLimit(
  convex: ConvexHttpClient,
  apiKeyHash: string,
): Promise<{ authorized: false } | ({ authorized: true } & DistributedRateLimit)> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_OCC_RETRIES; attempt++) {
    try {
      // ConvexHttpClient serializes queued mutations per client. Keep that
      // queue enabled here so requests handled by the same server instance do
      // not all race on the same token bucket document.
      return await convex.mutation(api.rate_limits.mutations.consume, { apiKeyHash });
    } catch (error) {
      if (!isOccError(error) || attempt === MAX_OCC_RETRIES) throw error;
      lastError = error;
      // Exponential backoff + random jitter
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * BASE_DELAY_MS;
      await sleep(delay);
    }
  }
  throw lastError;
}
