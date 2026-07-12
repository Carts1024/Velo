#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { loadBenchmarkContract, normalizeRuns, validateCapturedReport } from "./benchmark-contract.mjs";

const args = parseArgs(process.argv.slice(2));
const input = args.report ?? "benchmarks/reports/final.json";
const report = JSON.parse(await readFile(resolve(input), "utf8"));
const contract = await loadBenchmarkContract();
const errors = validateCapturedReport(report, contract);
if (errors.length) throw new Error(`Cannot generate report:\n${errors.join("\n")}`);
const runs = normalizeRuns(report);
const lines = ["# Benchmark report", "", `Evidence captured: ${runs.map((run) => run.capturedAt).sort()[0] ?? "unknown"}`, "", "| Scenario | Profile | Window | Attempted | Successful | Successful throughput | Error rate | p50 | p95 | p99 |", "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
for (const run of runs) lines.push(`| ${run.scenario} | ${run.profile} | ${run.window} | ${run.attemptedSamples} | ${run.successfulSamples} | ${run.throughput.successfulPerSecond}/s | ${(run.errorSamples / run.attemptedSamples * 100).toFixed(2)}% | ${run.latencyMs.p50} ms | ${run.latencyMs.p95} ms | ${run.latencyMs.p99} ms |`);
lines.push("", "## 503 attribution", "", "| Run | Count | Attributed | Unattributed | Dependencies |", "| --- | ---: | ---: | ---: | --- |");
for (const run of runs) lines.push(`| ${run.runId} | ${run.http503.count} | ${run.http503.attributedCount} | ${run.http503.unattributedCount} | ${Object.entries(run.http503.byDependency).map(([key, value]) => `${key}: ${value}`).join(", ") || "none"} |`);
lines.push("", "## Velo-controlled contributors", "", "Contributor attribution is supplied by the captured stage timings. Missing stage data is reported as unresolved and blocks qualification.", "", "| Run | Contributors |", "| --- | --- |", ...runs.map((run) => `| ${run.runId} | ${Object.entries(run.contributors ?? {}).sort(([, left], [, right]) => right - left).slice(0, 3).map(([name, value]) => `${name}: ${value} ms`).join(", ") || "unresolved"} |`));
const output = args.out ?? input.replace(/\.json$/, ".md");
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(resolve(output), `${lines.join("\n")}\n`);
console.log(output);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index++) {
    if (!values[index].startsWith("--")) continue;
    const key = values[index].slice(2);
    const next = values[index + 1];
    parsed[key] = next && !next.startsWith("--") ? values[++index] : true;
  }
  return parsed;
}
