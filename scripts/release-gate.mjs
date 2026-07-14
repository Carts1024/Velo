#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateReport } from "./release-gate-lib.mjs";
import { loadSprint11Contract } from "./sprint11-contract.mjs";
import { evaluateSprint11 } from "./sprint11-gate-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node scripts/release-gate.mjs --report <path>");
  process.exit(0);
}
const reportPath = args.report ?? process.env.VELO_BENCHMARK_REPORT ?? "benchmarks/reports/final.json";
let report;
const failures = [];
try { report = JSON.parse(await readFile(resolve(reportPath), "utf8")); }
catch (error) { failures.push(`report unavailable: ${error?.code === "ENOENT" ? "file not found" : "invalid JSON"}`); }
let result;
if (!report) {
  result = { status: "fail", failures };
} else if (report.manifestVersion === 4) {
  // Compatibility entrypoint: Sprint 11 evidence has one canonical evaluator.
  const { manifest } = await loadSprint11Contract();
  const qualification = await evaluateSprint11(report, { manifest, requireApprovals: true });
  result = {
    ...qualification,
    status: qualification.machineVerdict === "PASS" && qualification.approvalStatus === "APPROVED"
      ? "pass"
      : qualification.machineVerdict === "FAIL" ? "fail" : "pending",
  };
} else {
  result = await evaluateReport(report, { rejectOverrides: "runs" in args || "max-error-rate" in args || "max-regression" in args });
}
console.log(JSON.stringify({ ...result, checkedAt: new Date().toISOString(), report: reportPath }, null, 2));
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
