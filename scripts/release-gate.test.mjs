import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateReport } from "./release-gate-lib.mjs";

function upgradeFixture(report) {
  if (!Array.isArray(report.runs)) return report;
  report.runs = report.runs.flatMap((run) =>
    ["normal", "growth"].flatMap((profile) =>
      ["cold", "warm"].map((temperature) => {
        const requestsPerSecond = profile === "growth" ? 50 : 10;
        const concurrency = profile === "growth" ? 100 : 25;
        return {
          ...structuredClone(run),
          runId: `${run.runId}-${profile}-${temperature}`,
          manifestVersion: 3,
          profile,
          temperature,
          p99CliffExplained: profile === "growth" ? true : run.p99CliffExplained,
          workload: {
            ...run.workload,
            concurrency,
            targetRequestsPerSecond: requestsPerSecond,
          },
          throughput: {
            attemptedPerSecond: requestsPerSecond,
            successfulPerSecond: requestsPerSecond,
          },
          pacing: {
            targetRequestsPerSecond: requestsPerSecond,
            achievedRequestsPerSecond: requestsPerSecond,
          },
          saturation: { saturatedArrivals: 0, maxInFlight: concurrency },
        };
      }),
    ),
  );
  return report;
}

async function run(report) { return evaluateReport(upgradeFixture(JSON.parse(await readFile(report, "utf8")))); }

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
  const report = upgradeFixture(JSON.parse(await readFile("benchmarks/test-fixtures/gate-pass-report.json", "utf8")));
  const result = await evaluateReport(report, { rejectOverrides: true });
  assert.equal(result.status, "fail");
  assert.match(result.failures.join(" "), /thresholds are locked/);
});

test("rejects the exact 0.5% error boundary and locked latency failures", async () => {
  const report = upgradeFixture(JSON.parse(await readFile("benchmarks/test-fixtures/gate-pass-report.json", "utf8")));
  report.runs[0].successfulSamples = 995;
  report.runs[0].errorSamples = 5;
  report.runs[0].workload.successfulSamples = 995;
  report.runs[0].errorTaxonomy.http_5xx = 5;
  report.runs[1].latencyMs.p95 = 351;
  const result = await evaluateReport(report);
  assert.equal(result.status, "fail");
  assert.match(result.failures.join(" "), /below 0.50%/);
  assert.match(result.failures.join(" "), /locked 350ms/);
});
