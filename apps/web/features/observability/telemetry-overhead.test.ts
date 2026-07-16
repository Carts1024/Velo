import assert from "node:assert/strict";
import test from "node:test";

import { measureTelemetryStage, startRequestTelemetry } from "../../core/observability.ts";

test("telemetry overhead comparison produces finite baseline and instrumented measurements", async () => {
  const iterations = 500;
  const baselineStartedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve(index);
  }
  const baselineMs = performance.now() - baselineStartedAt;

  const instrumentedStartedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const telemetry = startRequestTelemetry(
      {
        headers: new Headers({ "x-correlation-id": `overhead-${String(index).padStart(8, "0")}` }),
      },
      "benchmark.overhead",
    );
    await measureTelemetryStage(telemetry, "noop", () => Promise.resolve(index));
  }
  const instrumentedMs = performance.now() - instrumentedStartedAt;

  assert.ok(Number.isFinite(baselineMs));
  assert.ok(Number.isFinite(instrumentedMs));
  assert.ok(instrumentedMs >= 0);
});
