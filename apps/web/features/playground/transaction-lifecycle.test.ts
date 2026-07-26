import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYGROUND_PENDING_STORAGE_KEY,
  initialTransactionLifecycle,
  parsePendingTransaction,
  pollPendingTransaction,
  transactionLifecycleReducer,
} from "./transaction-lifecycle.ts";

test("transaction lifecycle covers review, signing, submission, and terminal states", () => {
  let state = initialTransactionLifecycle;
  state = transactionLifecycleReducer(state, { type: "SIMULATE" });
  assert.equal(state.status, "simulating");
  state = transactionLifecycleReducer(state, { type: "REVIEW", transactionHash: "a".repeat(64) });
  assert.equal(state.status, "reviewing");
  state = transactionLifecycleReducer(state, { type: "CONFIRM_REVIEW" });
  assert.equal(state.status, "ready_to_sign");
  state = transactionLifecycleReducer(state, { type: "REQUEST_SIGNATURE" });
  assert.equal(state.status, "awaiting_wallet");
  state = transactionLifecycleReducer(state, { type: "SIGNED" });
  assert.equal(state.status, "signed");
  state = transactionLifecycleReducer(state, { type: "SUBMIT" });
  assert.equal(state.status, "submitting");
  state = transactionLifecycleReducer(state, { type: "PENDING" });
  assert.equal(state.status, "pending");
  state = transactionLifecycleReducer(state, { type: "SUCCESS" });
  assert.equal(state.status, "successful");
});

test("lifecycle rejects duplicate signing and submission transitions", () => {
  const awaiting = {
    status: "awaiting_wallet" as const,
    transactionHash: "a".repeat(64),
    error: null,
  };
  assert.equal(transactionLifecycleReducer(awaiting, { type: "REQUEST_SIGNATURE" }), awaiting);
  const submitting = { ...awaiting, status: "submitting" as const };
  assert.equal(transactionLifecycleReducer(submitting, { type: "SUBMIT" }), submitting);
});

test("unconfirming review returns to reviewing and failure states can retry safely", () => {
  const ready = {
    status: "ready_to_sign" as const,
    transactionHash: "a".repeat(64),
    error: null,
  };
  assert.equal(
    transactionLifecycleReducer(ready, { type: "UNCONFIRM_REVIEW" }).status,
    "reviewing",
  );
  for (const stage of ["signing", "review", "submission"] as const) {
    const failed = {
      status: "failed" as const,
      transactionHash: "a".repeat(64),
      error: { stage, message: "retryable" },
    };
    assert.equal(
      transactionLifecycleReducer(failed, { type: "REQUEST_SIGNATURE" }).status,
      "awaiting_wallet",
    );
  }
  const executionFailure = {
    status: "failed" as const,
    transactionHash: "a".repeat(64),
    error: { stage: "execution" as const, message: "final" },
  };
  assert.equal(
    transactionLifecycleReducer(executionFailure, { type: "REQUEST_SIGNATURE" }),
    executionFailure,
  );
});

test("fresh simulation can restart terminal lifecycle states", () => {
  for (const status of ["failed", "unknown", "successful"] as const) {
    assert.equal(
      transactionLifecycleReducer(
        { status, transactionHash: "a".repeat(64), error: null },
        { type: "SIMULATE" },
      ).status,
      "simulating",
    );
  }
});

test("lifecycle records stage-specific failures, expiry, unknown, and reset", () => {
  const failed = transactionLifecycleReducer(initialTransactionLifecycle, {
    type: "FAIL",
    stage: "simulation",
    message: "RPC unavailable",
    correlationId: "corr-1",
  });
  assert.deepEqual(failed.error, {
    stage: "simulation",
    message: "RPC unavailable",
    correlationId: "corr-1",
  });
  assert.equal(failed.status, "simulation_failed");
  assert.equal(
    transactionLifecycleReducer(
      { ...initialTransactionLifecycle, status: "pending" },
      { type: "EXPIRE" },
    ).status,
    "expired",
  );
  assert.equal(
    transactionLifecycleReducer(
      { ...initialTransactionLifecycle, status: "pending" },
      { type: "UNKNOWN" },
    ).status,
    "unknown",
  );
  assert.deepEqual(
    transactionLifecycleReducer(failed, { type: "RESET" }),
    initialTransactionLifecycle,
  );
});

test("pending recovery accepts only the versioned minimal identity", () => {
  assert.equal(PLAYGROUND_PENDING_STORAGE_KEY, "velo:playground:pending:v1");
  assert.deepEqual(
    parsePendingTransaction(
      JSON.stringify({
        schemaVersion: 1,
        network: "testnet",
        transactionHash: "a".repeat(64),
        startedAt: "2026-07-23T00:00:00.000Z",
      }),
    ),
    {
      schemaVersion: 1,
      network: "testnet",
      transactionHash: "a".repeat(64),
      startedAt: "2026-07-23T00:00:00.000Z",
    },
  );
  assert.equal(parsePendingTransaction(null), null);
  assert.equal(parsePendingTransaction("{"), null);
  assert.equal(
    parsePendingTransaction(
      JSON.stringify({
        schemaVersion: 1,
        network: "mainnet",
        transactionHash: "a".repeat(64),
        startedAt: "2026-07-23T00:00:00.000Z",
      }),
    ),
    null,
  );
  assert.equal(
    parsePendingTransaction(
      JSON.stringify({
        schemaVersion: 1,
        network: "testnet",
        transactionHash: "a".repeat(64),
        startedAt: "invalid",
        signedXdr: "must-not-persist",
      }),
    ),
    null,
  );
});

test("bounded polling tolerates transient lookup failures and resolves without resubmission", async () => {
  let lookups = 0;
  let waits = 0;
  const resolved = await pollPendingTransaction(
    async () => {
      lookups += 1;
      if (lookups === 1) throw new Error("temporary network failure");
      return lookups === 2 ? { status: "pending" } : { status: "success" };
    },
    (result) => result.status === "pending",
    {
      attempts: 3,
      wait: async () => {
        waits += 1;
      },
    },
  );
  assert.deepEqual(resolved, { status: "success" });
  assert.equal(lookups, 3);
  assert.equal(waits, 2);

  let failedLookups = 0;
  const unresolved = await pollPendingTransaction(
    async () => {
      failedLookups += 1;
      throw new Error("still unavailable");
    },
    () => true,
    { attempts: 2, wait: async () => {} },
  );
  assert.equal(unresolved, null);
  assert.equal(failedLookups, 2);
});
