#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateReport } from "./release-gate-lib.mjs";

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
const result = report ? await evaluateReport(report, { rejectOverrides: "runs" in args || "max-error-rate" in args || "max-regression" in args }) : { status: "fail", failures };
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
