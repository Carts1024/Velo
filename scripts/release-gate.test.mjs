import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateReport } from "./release-gate-lib.mjs";

async function run(report) { return evaluateReport(JSON.parse(await readFile(report, "utf8"))); }

test("known-good three-window fixture passes", async () => {
  const result = await run("benchmarks/test-fixtures/gate-pass-report.json");
  assert.equal(result.status, "pass", result.failures.join("\n"));
});

test("current captured report is rejected as non-qualifying", async () => {
  const result = await run("benchmarks/reports/payment-intent-create.json");
  assert.equal(result.status, "fail");
  assert.match(result.failures.join(" "), /successful samples|error rate|missing required window/);
});

test("threshold overrides are rejected", async () => {
  const report = JSON.parse(await readFile("benchmarks/test-fixtures/gate-pass-report.json", "utf8"));
  const result = await evaluateReport(report, { rejectOverrides: true });
  assert.equal(result.status, "fail");
  assert.match(result.failures.join(" "), /thresholds are locked/);
});
