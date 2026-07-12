#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    "Usage: node scripts/release-gate.mjs --report <path> [--runs 3] [--max-error-rate 0.005] [--max-regression 0.05]",
  );
  process.exit(0);
}
const reportPath =
  args.report ?? process.env.VELO_BENCHMARK_REPORT ?? "benchmarks/reports/final.json";
let report;
try {
  report = JSON.parse(await readFile(resolve(reportPath), "utf8"));
} catch (error) {
  const reason = error?.code === "ENOENT" ? "file not found" : "invalid JSON";
  console.error(`Benchmark report unavailable: ${reportPath} (${reason}).`);
  console.error(
    "Capture an authorized report first, then run: pnpm benchmark:gate -- --report <path>",
  );
  process.exit(1);
}
const requirements = {
  runs: positiveInt(args.runs ?? "3"),
  maxErrorRate: Number(args["max-error-rate"] ?? "0.005"),
  maxRegression: Number(args["max-regression"] ?? "0.05"),
};

const runs = normalizeRuns(report);
const failures = [];
if (runs.length < requirements.runs) {
  failures.push(`requires ${requirements.runs} complete benchmark runs; found ${runs.length}`);
}

for (const [index, run] of runs.entries()) {
  const label = run.runId ?? `run-${index + 1}`;
  const scenarios = run.scenarios ?? (run.scenario ? [run] : []);
  if (scenarios.length === 0) failures.push(`${label} has no scenario results`);
  for (const scenario of scenarios) {
    const hasSampleCounts =
      Number.isFinite(scenario.successfulSamples) && Number.isFinite(scenario.errors);
    if (!hasSampleCounts) {
      failures.push(`${label}/${scenario.scenario}: missing successfulSamples/errors counters`);
    }
    const samples = hasSampleCounts ? scenario.successfulSamples + scenario.errors : 0;
    const errorRate = samples > 0 ? scenario.errors / samples : 1;
    if (scenario.status !== "captured")
      failures.push(`${label}/${scenario.scenario}: evidence is not captured`);
    if (!scenario.latencyMs?.p95 || scenario.latencyMs.p99 == null) {
      failures.push(`${label}/${scenario.scenario}: missing p95/p99 distribution`);
    }
    if (errorRate > requirements.maxErrorRate) {
      failures.push(
        `${label}/${scenario.scenario}: error rate ${(errorRate * 100).toFixed(2)}% exceeds ${(requirements.maxErrorRate * 100).toFixed(2)}%`,
      );
    }
    if (scenario.profile === "growth" && scenario.p99CliffExplained !== true) {
      failures.push(
        `${label}/${scenario.scenario}: growth-load p99 cliff is not explicitly explained`,
      );
    }
  }
}

const baseline = report.baseline;
if (baseline) {
  for (const run of runs) {
    for (const scenario of run.scenarios ?? []) {
      const before = baseline[scenario.scenario]?.latencyMs?.p95;
      const after = scenario.latencyMs?.p95;
      if (
        Number.isFinite(before) &&
        Number.isFinite(after) &&
        after > before * (1 + requirements.maxRegression)
      ) {
        failures.push(
          `${run.runId}/${scenario.scenario}: p95 regression exceeds ${(requirements.maxRegression * 100).toFixed(0)}%`,
        );
      }
    }
  }
}

const result = {
  status: failures.length === 0 ? "pass" : "fail",
  checkedAt: new Date().toISOString(),
  report: reportPath,
  requirements,
  runsChecked: runs.length,
  failures,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;

function normalizeRuns(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.runs)) return value.runs;
  if (value.status === "captured") return [value];
  return [];
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    parsed[key] = next && !next.startsWith("--") ? values[++index] : true;
  }
  return parsed;
}

function positiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error("runs must be a positive integer");
  return parsed;
}
