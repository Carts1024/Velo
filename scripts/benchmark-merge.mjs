#!/usr/bin/env node

import { resolve } from "node:path";

import { loadBenchmarkContract } from "./benchmark-contract.mjs";
import { assembleWindowReports } from "./benchmark-merge-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    "Usage: node scripts/benchmark-merge.mjs --reports morning.json,afternoon.json,evening.json --out final.json --samples-out final.ndjson",
  );
  process.exit(0);
}
const reportPaths = String(args.reports ?? "")
  .split(",")
  .filter(Boolean)
  .map(resolve);
const output = await assembleWindowReports({
  reportPaths,
  outputPath: resolve(required(args.out, "--out is required")),
  samplesPath: resolve(required(args["samples-out"], "--samples-out is required")),
  contract: await loadBenchmarkContract(),
});
console.log(output.outputPath);

function required(value, message) {
  if (!value || value === true) throw new Error(message);
  return value;
}

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
