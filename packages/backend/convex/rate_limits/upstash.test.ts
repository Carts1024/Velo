import { describe, expect, test } from "vitest";

import { consumeAtomicPair, refillBucket, type BucketState } from "./model";
import {
  ADMISSION_TTL_MS,
  API_KEY_LIMIT,
  BUCKET_TTL_MS,
  EXTERNAL_CALL_DEADLINE_MS,
  PAYMENT_ADMISSION_LUA,
  PROJECT_LIMIT,
} from "./upstash";

describe("exact payment admission model", () => {
  test("admits exactly 200 of 201 simultaneous API-key requests without partial project consumption", () => {
    let api: BucketState | undefined;
    let project: BucketState | undefined;
    let admitted = 0;
    for (let index = 0; index < 201; index += 1) {
      const result = consumeAtomicPair({
        api,
        project,
        apiSpec: API_KEY_LIMIT,
        projectSpec: PROJECT_LIMIT,
        now: 1_000,
      });
      api = result.api;
      project = result.project;
      if (result.allowed) admitted += 1;
    }
    expect(admitted).toBe(200);
    expect(api?.tokens).toBe(0);
    expect(project?.tokens).toBe(100);
  });

  test("admits exactly 300 project requests across multiple API keys", () => {
    const apiBuckets = new Map<number, BucketState>();
    let project: BucketState | undefined;
    let admitted = 0;
    for (let index = 0; index < 301; index += 1) {
      const key = index % 3;
      const result = consumeAtomicPair({
        api: apiBuckets.get(key),
        project,
        apiSpec: API_KEY_LIMIT,
        projectSpec: PROJECT_LIMIT,
        now: 5_000,
      });
      apiBuckets.set(key, result.api);
      project = result.project;
      if (result.allowed) admitted += 1;
    }
    expect(admitted).toBe(300);
    expect(project?.tokens).toBe(0);
    expect([...apiBuckets.values()].map((bucket) => bucket.tokens)).toEqual([100, 100, 100]);
  });

  test("refill math caps capacity and rounds the next retry boundary upward", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const state = { tokens: (seed % 17) / 17, updatedAt: 10_000 };
      const elapsed = seed * 3;
      const refilled = refillBucket(state, API_KEY_LIMIT, 10_000 + elapsed);
      expect(refilled.tokens).toBeCloseTo(
        Math.min(API_KEY_LIMIT.capacity, state.tokens + (elapsed / 1_000) * 60),
        10,
      );
      expect(refilled.tokens).toBeLessThanOrEqual(API_KEY_LIMIT.capacity);
    }
    const denied = consumeAtomicPair({
      api: { tokens: 0.94, updatedAt: 0 },
      project: { tokens: 10, updatedAt: 0 },
      apiSpec: API_KEY_LIMIT,
      projectSpec: PROJECT_LIMIT,
      now: 0,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(2);
  });

  test("Lua contract binds admission fingerprints, uses Redis time, and expires all records", () => {
    expect(PAYMENT_ADMISSION_LUA).toContain('redis.call("TIME")');
    expect(PAYMENT_ADMISSION_LUA).toContain('return {"fingerprint_conflict"');
    expect(PAYMENT_ADMISSION_LUA.match(/redis\.call\("PEXPIRE"/g)).toHaveLength(4);
    expect(ADMISSION_TTL_MS).toBeGreaterThan(0);
    expect(BUCKET_TTL_MS).toBeGreaterThan(ADMISSION_TTL_MS);
    expect(EXTERNAL_CALL_DEADLINE_MS).toBeLessThan(250);
  });
});
