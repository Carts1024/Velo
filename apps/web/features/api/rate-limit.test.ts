import assert from "node:assert/strict";
import test from "node:test";

import { distributedRateLimitHeaders } from "../../core/api/distributed-rate-limit.ts";

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
