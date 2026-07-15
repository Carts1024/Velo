#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadBenchmarkContract } from "./benchmark-contract.mjs";
import {
  evaluateBenchmarkReport,
  indexBaselineArtifact,
  indexNdjsonArtifact,
  resolveSafeReportArtifact,
} from "./benchmark-gate-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node scripts/benchmark-gate.mjs --report <qualification.json>");
  process.exit(0);
}
const reportPath = resolve(
  args.report ?? process.env.VELO_BENCHMARK_REPORT ?? "benchmarks/reports/final.json",
);
let result;
try {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const artifactPath = await resolveSafeReportArtifact(
    reportPath,
    report.sampleArtifact?.path,
    "sample artifact",
  );
  const baselinePath = await resolveSafeReportArtifact(
    reportPath,
    report.baseline?.artifact,
    "baseline artifact",
  );
  const contract = await loadBenchmarkContract();
  const [artifactIndex, baselineIndex] = await Promise.all([
    indexNdjsonArtifact(artifactPath, contract),
    indexBaselineArtifact(baselinePath),
  ]);
  result = await evaluateBenchmarkReport(report, {
    contract,
    artifactIndex,
    baselineIndex,
    rejectOverrides:
      "runs" in args || "max-error-rate" in args || "max-regression" in args || "slo" in args,
  });
} catch (error) {
  result = {
    status: "fail",
    failures: [
      `qualification evidence unavailable: ${error?.code === "ENOENT" ? "file not found" : error instanceof Error ? error.message : "invalid evidence"}`,
    ],
  };
}
console.log(
  JSON.stringify({ ...result, checkedAt: new Date().toISOString(), report: reportPath }, null, 2),
);
if (result.status !== "pass") process.exitCode = 1;

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--")) continue;
    const key = values[index].slice(2);
    const next = values[index + 1];
    parsed[key] = next && !next.startsWith("--") ? values[++index] : true;
  }
  return parsed;
}
