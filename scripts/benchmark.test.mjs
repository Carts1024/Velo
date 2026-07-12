import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadBenchmarkContract, validateCapturedReport } from "./benchmark-contract.mjs";

const contract = await loadBenchmarkContract();
const fixture = JSON.parse(await readFile("benchmarks/test-fixtures/pass-report.json", "utf8"));

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
