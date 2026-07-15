#!/usr/bin/env node

import { randomUUID } from "node:crypto";

import { parseResponseServerTimings } from "./benchmark/adapters.mjs";

const apiKeyPattern = /^tk_live_[a-f0-9]{32}$/;

export async function runPaymentApiSmoke({
  baseUrl,
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}) {
  if (!apiKeyPattern.test(apiKey)) {
    throw new Error("VELO_SMOKE_API_KEY must be a raw tk_live API key");
  }
  const origin = normalizeBaseUrl(baseUrl);
  const runId = randomUUID();
  const requests = [];

  const call = async (label, path, init, expectedStatus) => {
    const correlationId = `smoke-${runId}-${requests.length + 1}`;
    const startedAt = performance.now();
    const response = await fetchImpl(`${origin}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "x-correlation-id": correlationId,
        ...init?.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const durationMs = round(performance.now() - startedAt);
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`${label}: response was not valid JSON`);
    }
    if (response.status !== expectedStatus) {
      throw new Error(
        `${label}: expected HTTP ${expectedStatus}, received ${response.status}: ${text.slice(0, 300)}`,
      );
    }
    const returnedCorrelationId = response.headers.get("x-correlation-id");
    if (!returnedCorrelationId) throw new Error(`${label}: X-Correlation-Id header is missing`);
    const serverTiming = parseResponseServerTimings(response.headers);
    if (!serverTiming.some((timing) => timing.name === "velo_total")) {
      throw new Error(`${label}: Server-Timing velo_total entry is missing`);
    }
    const expectedError = expectedStatus >= 400;
    if (!expectedError) {
      for (const header of ["x-ratelimit-limit", "x-ratelimit-remaining"]) {
        if (!response.headers.has(header)) throw new Error(`${label}: ${header} header is missing`);
      }
    }
    requests.push({
      label,
      httpStatus: response.status,
      durationMs,
      correlationId: returnedCorrelationId,
      rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
      serverTiming: Object.fromEntries(
        serverTiming.map(({ name, durationMs }) => [name, durationMs]),
      ),
    });
    return body;
  };

  const createBody = {
    amount: "1.00",
    asset: "USDC",
    description: `10-request staging smoke ${runId}`,
  };
  const jsonHeaders = { "content-type": "application/json" };
  const v2Key = `smoke-${runId}-v2`;
  const v1Key = `smoke-${runId}-v1`;

  const v2 = await call(
    "1 v2 create",
    "/api/v2/payment-intents",
    {
      method: "POST",
      headers: { ...jsonHeaders, "idempotency-key": v2Key },
      body: JSON.stringify(createBody),
    },
    201,
  );
  assertPaymentIntent("1 v2 create", v2);

  const v2Replay = await call(
    "2 v2 idempotent replay",
    "/api/v2/payment-intents",
    {
      method: "POST",
      headers: { ...jsonHeaders, "idempotency-key": v2Key },
      body: JSON.stringify(createBody),
    },
    200,
  );
  assertSameIntent("2 v2 idempotent replay", v2Replay, v2.id);

  const v2Retrieved = await call(
    "3 v2 retrieve",
    `/api/v2/payment-intents/${encodeURIComponent(v2.id)}`,
    { method: "GET" },
    200,
  );
  assertSameIntent("3 v2 retrieve", v2Retrieved, v2.id);

  const v2List = await call(
    "4 v2 list",
    "/api/v2/payment-intents?limit=20",
    { method: "GET" },
    200,
  );
  assertList("4 v2 list", v2List, v2.id);

  const v1 = await call(
    "5 v1 create",
    "/api/v1/payment-intents",
    {
      method: "POST",
      headers: { ...jsonHeaders, "idempotency-key": v1Key },
      body: JSON.stringify(createBody),
    },
    201,
  );
  assertPaymentIntent("5 v1 create", v1);

  const v1Replay = await call(
    "6 v1 idempotent replay",
    "/api/v1/payment-intents",
    {
      method: "POST",
      headers: { ...jsonHeaders, "idempotency-key": v1Key },
      body: JSON.stringify(createBody),
    },
    200,
  );
  assertSameIntent("6 v1 idempotent replay", v1Replay, v1.id);

  const v1Retrieved = await call(
    "7 v1 retrieve",
    `/api/v1/payment-intents/${encodeURIComponent(v1.id)}`,
    { method: "GET" },
    200,
  );
  assertSameIntent("7 v1 retrieve", v1Retrieved, v1.id);

  const v1List = await call(
    "8 v1 list",
    "/api/v1/payment-intents?limit=20",
    { method: "GET" },
    200,
  );
  assertList("8 v1 list", v1List, v1.id);

  const conflict = await call(
    "9 v2 idempotency conflict",
    "/api/v2/payment-intents",
    {
      method: "POST",
      headers: { ...jsonHeaders, "idempotency-key": v2Key },
      body: JSON.stringify({ ...createBody, amount: "2.00" }),
    },
    409,
  );
  if (conflict?.error?.code !== "idempotency_key_conflict") {
    throw new Error("9 v2 idempotency conflict: expected idempotency_key_conflict error");
  }

  const limitedList = await call(
    "10 v2 paginated list",
    "/api/v2/payment-intents?limit=1",
    { method: "GET" },
    200,
  );
  assertList("10 v2 paginated list", limitedList);

  const durations = requests.map((request) => request.durationMs).sort((a, b) => a - b);
  return {
    status: "passed",
    requests: requests.length,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    results: requests,
  };
}

function assertPaymentIntent(label, value) {
  if (value?.object !== "payment_intent" || typeof value.id !== "string" || !value.id) {
    throw new Error(`${label}: payment-intent response shape is invalid`);
  }
}

function assertSameIntent(label, value, expectedId) {
  assertPaymentIntent(label, value);
  if (value.id !== expectedId) throw new Error(`${label}: returned a different payment intent`);
}

function assertList(label, value, expectedId) {
  if (
    value?.object !== "list" ||
    !Array.isArray(value.data) ||
    typeof value.hasMore !== "boolean" ||
    !(typeof value.nextCursor === "string" || value.nextCursor === null)
  ) {
    throw new Error(`${label}: list response shape is invalid`);
  }
  if (expectedId && !value.data.some((intent) => intent?.id === expectedId)) {
    throw new Error(`${label}: newly created payment intent is missing from the list`);
  }
}

function normalizeBaseUrl(value) {
  if (!value) throw new Error("VELO_SMOKE_BASE_URL is required");
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
    throw new Error("VELO_SMOKE_BASE_URL must use HTTPS, except for localhost development");
  }
  return url.toString().replace(/\/$/, "");
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function percentile(values, ratio) {
  return values[Math.ceil(values.length * ratio) - 1];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function main() {
  try {
    const result = await runPaymentApiSmoke({
      baseUrl: process.env.VELO_SMOKE_BASE_URL,
      apiKey: process.env.VELO_SMOKE_API_KEY,
      timeoutMs: Number.parseInt(process.env.VELO_SMOKE_TIMEOUT_MS ?? "10000", 10),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Payment API smoke test failed");
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
