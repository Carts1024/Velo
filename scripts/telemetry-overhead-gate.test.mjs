import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTelemetryOverhead } from "./telemetry-overhead-gate-lib.mjs";

const capture = (profile, mode, duration, count = 334, metadata = {}) => ({
  profile,
  mode,
  revision: "revision-1",
  cohort: "cohort-a",
  payloadHash: "payload-1",
  ...metadata,
  successfulDurationsMs: Array.from({ length: count }, () => duration),
});

const pairedProfiles = (enabledDuration = 102) =>
  ["normal", "warm"].flatMap((profile) => [
    capture(profile, "disabled", 100),
    capture(profile, "enabled", enabledDuration),
    capture(profile, "disabled", 100),
    capture(profile, "enabled", enabledDuration),
    capture(profile, "disabled", 100),
    capture(profile, "enabled", enabledDuration),
  ]);

test("requires three alternating pairs and one thousand successes per arm", () => {
  assert.equal(
    evaluateTelemetryOverhead([
      capture("normal", "disabled", 100),
      capture("normal", "enabled", 102),
    ]).reason,
    "insufficient_pairs",
  );
  const result = evaluateTelemetryOverhead(pairedProfiles());
  assert.equal(result.pass, true);
  assert.equal(result.results.normal.overheadRatio, 0.02);
  assert.equal(result.results.warm.overheadRatio, 0.02);
});

test("fails at or above three percent", () => {
  const result = evaluateTelemetryOverhead(pairedProfiles(103));
  assert.equal(result.pass, false);
});

test("rejects mismatched revision, cohort, or payload metadata within a pair", () => {
  const captures = pairedProfiles();
  captures[1] = capture("normal", "enabled", 102, 334, { revision: "other" });
  const result = evaluateTelemetryOverhead(captures);
  assert.equal(result.pass, false);
  assert.equal(result.reason, "metadata_mismatch");
  assert.equal(result.field, "revision");
});
