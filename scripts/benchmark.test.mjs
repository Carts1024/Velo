import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveTargetSamples } from "./benchmark-config.mjs";
import { loadBenchmarkContract, validateCapturedReport } from "./benchmark-contract.mjs";
import { runOpenLoop } from "./benchmark-runner-lib.mjs";

const contract = await loadBenchmarkContract();
const fixture = upgradeFixture(JSON.parse(await readFile("benchmarks/test-fixtures/pass-report.json", "utf8")));

function upgradeFixture(report) {
  report.manifestVersion = 3;
  report.runs = report.runs.map((run) => ({
    ...run,
    temperature: "warm",
    pacing: {
      targetRequestsPerSecond: run.workload.targetRequestsPerSecond,
      achievedRequestsPerSecond: run.throughput.attemptedPerSecond,
    },
    saturation: { saturatedArrivals: 0, maxInFlight: run.workload.concurrency },
  }));
  return report;
}

test("accepts a manifest-compliant three-window report", () => {
  assert.deepEqual(validateCapturedReport(fixture, contract), []);
});

test("rejects unknown profile, window, and mode metadata", () => {
  const invalid = structuredClone(fixture);
  invalid.runs[0].profile = "unlisted";
  invalid.runs[0].window = "overnight";
  invalid.runs[0].mode = "dry-run";
  const errors = validateCapturedReport(invalid, contract).join(" ");
  assert.match(errors, /unknown profile/);
  assert.match(errors, /invalid window/);
  assert.match(errors, /invalid capture mode/);
});

test("rejects mismatched attempted counters and unaccounted errors", () => {
  const invalid = structuredClone(fixture);
  invalid.runs[0].attemptedSamples = 11;
  invalid.runs[0].errorSamples = 1;
  invalid.runs[0].errorTaxonomy.unknown = 0;
  const errors = validateCapturedReport(invalid, contract).join(" ");
  assert.match(errors, /workload counters/);
  assert.match(errors, /taxonomy total/);
});

test("requires explicit 503 attribution accounting", () => {
  const invalid = structuredClone(fixture);
  invalid.runs[0].errorTaxonomy.http_5xx_503 = 1;
  const errors = validateCapturedReport(invalid, contract).join(" ");
  assert.match(errors, /http503.count/);
});

test("requires cold or warm identity and pacing evidence", () => {
  const invalid = structuredClone(fixture);
  delete invalid.runs[0].temperature;
  invalid.runs[1].pacing.achievedRequestsPerSecond = null;
  const errors = validateCapturedReport(invalid, contract).join(" ");
  assert.match(errors, /temperature/);
  assert.match(errors, /arrival rate/);
});

test("open-loop runner enforces the concurrency cap and reports saturation", async () => {
  let inFlight = 0;
  let observedMax = 0;
  const result = await runOpenLoop(10, 2, 1_000, async (sample) => {
    inFlight += 1;
    observedMax = Math.max(observedMax, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return { sample };
  });
  assert.equal(result.results.length, 10);
  assert.ok(observedMax <= 2);
  assert.equal(result.maxInFlight, observedMax);
  assert.ok(result.saturatedArrivals > 0);
});

test("explicit sample count overrides the qualification workload floor", () => {
  const normal = { requestsPerSecond: 10, durationSeconds: 300, sampleTarget: 1000 };

  assert.equal(resolveTargetSamples({ samples: "100" }, normal), 100);
  assert.equal(resolveTargetSamples({}, normal), 3000);
});
