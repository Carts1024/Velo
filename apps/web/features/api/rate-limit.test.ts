import assert from "node:assert/strict";
import test from "node:test";

import type { ConvexHttpClient } from "convex/browser";

import {
  consumeDistributedRateLimit,
  distributedRateLimitHeaders,
} from "../../core/api/distributed-rate-limit.ts";

test("distributed rate-limit metadata maps to stable HTTP headers", () => {
  assert.deepStrictEqual(
    distributedRateLimitHeaders({ allowed: true, limit: 200, remaining: 199, retryAfterMs: 0 }),
    { "X-RateLimit-Limit": "200", "X-RateLimit-Remaining": "199" },
  );

  assert.deepStrictEqual(
    distributedRateLimitHeaders({ allowed: false, limit: 200, remaining: 0, retryAfterMs: 1_250 }),
    { "X-RateLimit-Limit": "200", "X-RateLimit-Remaining": "0", "Retry-After": "2" },
  );
});

test("distributed rate-limit reservations bypass the shared HTTP client mutation queue", async () => {
  const calls: unknown[][] = [];
  const convex = {
    async mutation(...args: unknown[]) {
      calls.push(args);
      return {
        authorized: true,
        allowed: true,
        limit: 200,
        remaining: 199,
        retryAfterMs: 0,
      };
    },
  } as unknown as ConvexHttpClient;

  const result = await consumeDistributedRateLimit(convex, "api-key-hash");

  assert.equal(result.authorized, true);
  assert.deepStrictEqual(calls[0]?.[2], { skipQueue: true });
});
