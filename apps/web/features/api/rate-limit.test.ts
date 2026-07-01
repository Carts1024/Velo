import assert from "node:assert/strict";
import test from "node:test";

import { rateLimiter } from "../../core/api/rate-limit.ts";

test("Rate limiter enforces key-based limit", () => {
  rateLimiter.reset();

  // First request should be allowed
  const res1 = rateLimiter.checkLimit("key1");
  assert.equal(res1.allowed, true);
  assert.equal(res1.headers["X-RateLimit-Limit"], "60");
  assert.equal(res1.headers["X-RateLimit-Remaining"], "59");

  // Second request should also be allowed and remaining decreased
  const res2 = rateLimiter.checkLimit("key1");
  assert.equal(res2.allowed, true);
  assert.equal(res2.headers["X-RateLimit-Remaining"], "58");
});

test("Rate limiter caches and enforces project-based limit", () => {
  rateLimiter.reset();

  const key = "key1";
  const project = "proj1";
  rateLimiter.cacheKeyProjectMapping(key, project);

  // First request consumes from both key (60) and project (100)
  const res1 = rateLimiter.checkLimit(key);
  assert.equal(res1.allowed, true);
  // The limit returned will be 60 (the smaller of key 60 and project 100)
  assert.equal(res1.headers["X-RateLimit-Limit"], "60");
  // Remaining tokens for key = 59, project = 99. The remaining returned is the min (59).
  assert.equal(res1.headers["X-RateLimit-Remaining"], "59");
});

test("Rate limiter blocks when rate limit is exceeded", () => {
  rateLimiter.reset();

  // Create a local limiter subclass or mock/manually exhaust key
  // Since KEY_LIMIT is 60, we can quickly simulate consuming 60 tokens
  for (let i = 0; i < 60; i++) {
    const res = rateLimiter.checkLimit("key-limit-test");
    assert.equal(res.allowed, true);
  }

  // The 61st request should be blocked
  const blockedRes = rateLimiter.checkLimit("key-limit-test");
  assert.equal(blockedRes.allowed, false);
  assert.equal(blockedRes.headers["X-RateLimit-Remaining"], "0");
  assert.ok(blockedRes.headers["Retry-After"]);
  assert.ok(Number(blockedRes.headers["Retry-After"]) > 0);
});
