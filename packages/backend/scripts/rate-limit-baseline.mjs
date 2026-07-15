import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const stagingBaseline = makeFunctionReference("payment_intents/public_api:stagingBaseline");

const samples = positiveInteger(
  process.env.VELO_BASELINE_SAMPLES ?? "100",
  "VELO_BASELINE_SAMPLES",
);
const requestsPerSecond = positiveInteger(
  process.env.VELO_BASELINE_REQUESTS_PER_SECOND ?? "10",
  "VELO_BASELINE_REQUESTS_PER_SECOND",
);
const convexUrl = required("CONVEX_URL");
const apiKeyHash = required("VELO_BENCHMARK_API_KEY_HASH");
if (!/^[a-f0-9]{64}$/.test(apiKeyHash)) {
  throw new Error(
    "VELO_BENCHMARK_API_KEY_HASH must be the 64-character lowercase SHA-256 hash of the raw tk_live API key, not the raw key",
  );
}
const client = new ConvexHttpClient(convexUrl);
const durations = [];
const failures = [];
const stageDurations = new Map();
const runStartedAt = performance.now();

for (let sample = 0; sample < samples; sample += 1) {
  const scheduledAt = runStartedAt + (sample * 1_000) / requestsPerSecond;
  const waitMs = scheduledAt - performance.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const startedAt = performance.now();
  try {
    const result = await client.action(stagingBaseline, {
      apiKeyHash,
      admissionId: randomUUID(),
    });
    const durationMs = performance.now() - startedAt;
    if (result.status === "success") {
      durations.push(durationMs);
      if (result.timings && typeof result.timings === "object") {
        for (const [name, value] of Object.entries(result.timings)) {
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          const values = stageDurations.get(name) ?? [];
          values.push(value);
          stageDurations.set(name, values);
        }
      }
    } else
      failures.push({
        sample,
        status: result.status,
        ...(result.reason ? { reason: result.reason } : {}),
      });
  } catch (error) {
    failures.push({
      sample,
      status: "exception",
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

durations.sort((a, b) => a - b);
const report = {
  samples,
  successful: durations.length,
  failed: failures.length,
  requestsPerSecond,
  p50Ms: percentile(durations, 0.5),
  p95Ms: percentile(durations, 0.95),
  stageTimings: Object.fromEntries(
    [...stageDurations.entries()].map(([name, values]) => [
      name,
      { p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95) },
    ]),
  ),
  gate: { p50Ms: 100, p95Ms: 250 },
  failures: failures.slice(0, 10),
};
console.log(JSON.stringify(report, null, 2));

if (
  failures.length > 0 ||
  report.p50Ms === null ||
  report.p95Ms === null ||
  report.p50Ms > report.gate.p50Ms ||
  report.p95Ms > report.gate.p95Ms
) {
  process.exitCode = 1;
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  return Math.round(values[Math.ceil(values.length * ratio) - 1] * 100) / 100;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be positive`);
  return parsed;
}
