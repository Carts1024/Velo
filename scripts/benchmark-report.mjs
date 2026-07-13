#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { generateBenchmarkMarkdown } from "./benchmark-report-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    "Usage: node scripts/benchmark-report.mjs --report <qualification.json> --out <report.md>",
  );
  process.exit(0);
}
const reportPath = resolve(
  args.report ?? process.env.VELO_BENCHMARK_REPORT ?? "benchmarks/reports/final.json",
);
const outputPath = resolve(args.out ?? "benchmarks/reports/final.md");
const report = JSON.parse(await readFile(reportPath, "utf8"));
await writeFile(outputPath, generateBenchmarkMarkdown(report));
console.log(outputPath);

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
