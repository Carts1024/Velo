import assert from "node:assert/strict";
import test from "node:test";

import {
  createSimulationContextKey,
  simulationFreshness,
  type SimulationContext,
} from "./simulation-state.ts";

const context: SimulationContext = {
  network: "testnet",
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  expectedWasmHash: "ab".repeat(32),
  expectedSpecHash: "cd".repeat(32),
  sourceAccount: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  functionName: "echo",
  arguments: { nested: { count: "1", enabled: true }, items: ["a", "b"] },
  settings: { baseFee: "100", cpuInstructions: 0 },
};

test("context keys are stable across object key formatting", () => {
  const equivalent: SimulationContext = {
    ...context,
    arguments: { items: ["a", "b"], nested: { enabled: true, count: "1" } },
  };
  assert.equal(createSimulationContextKey(context), createSimulationContextKey(equivalent));
});

test("every reviewed context field invalidates simulation", () => {
  const original = createSimulationContextKey(context);
  const variants: SimulationContext[] = [
    { ...context, contractId: context.contractId.replace("C", "D") },
    { ...context, expectedWasmHash: "ef".repeat(32) },
    { ...context, expectedSpecHash: "01".repeat(32) },
    { ...context, sourceAccount: context.sourceAccount.replace("G", "M") },
    { ...context, functionName: "other" },
    { ...context, arguments: { ...context.arguments, added: null } },
    { ...context, settings: { ...context.settings, baseFee: "200" } },
    { ...context, settings: { ...context.settings, cpuInstructions: 1 } },
  ];
  for (const variant of variants) {
    assert.notEqual(createSimulationContextKey(variant), original);
  }
});

test("freshness distinguishes current, stale, expired, and restore-required results", () => {
  const key = createSimulationContextKey(context);
  assert.equal(
    simulationFreshness(
      { contextKey: key, expiresAt: "2026-07-23T01:05:00.000Z", status: "success" },
      key,
      Date.parse("2026-07-23T01:00:00.000Z"),
    ),
    "fresh",
  );
  assert.equal(
    simulationFreshness(
      { contextKey: key, expiresAt: "2026-07-23T01:05:00.000Z", status: "success" },
      `${key}-changed`,
      Date.parse("2026-07-23T01:00:00.000Z"),
    ),
    "stale",
  );
  assert.equal(
    simulationFreshness(
      { contextKey: key, expiresAt: "2026-07-23T01:05:00.000Z", status: "success" },
      key,
      Date.parse("2026-07-23T01:05:00.000Z"),
    ),
    "expired",
  );
  assert.equal(
    simulationFreshness(
      { contextKey: key, expiresAt: "2026-07-23T01:05:00.000Z", status: "restore_required" },
      key,
      Date.parse("2026-07-23T01:00:00.000Z"),
    ),
    "restore_required",
  );
});
