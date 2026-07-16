#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { loadSprint11Contract, freezeManifest, assertResumeDigests, digest, validateSprint11Manifest } from "./sprint11-contract.mjs";
import { evaluateSprint11 } from "./sprint11-gate-lib.mjs";

const command = process.argv[2] ?? "plan";
const args = parseArgs(process.argv.slice(3));
const manifestPath = args.manifest ?? "benchmarks/sprint11/manifest.json";
const contract = await loadSprint11Contract({ manifestPath });

if (command === "plan") {
  const cellsPerSubject = contract.manifest.scenarios.length * 2 * 2 * contract.manifest.windows.length;
  print({ command, manifestVersion: 4, evidenceSchemaVersion: 3, status: contract.manifest.qualificationStatus, arms: contract.manifest.arms, cellsPerSubject, matchedCells: cellsPerSubject * 2 });
} else if (command === "freeze") {
  const revision = args.revision ?? process.env.GITHUB_SHA ?? gitRevision();
  const status = gitStatus();
  const frozen = freezeManifest(contract.manifest, { revision, gitStatus: status });
  await writeFile(resolve(manifestPath), `${JSON.stringify(frozen, null, 2)}\n`);
  print(frozen);
} else if (command === "run") {
  const report = pendingReport(contract.manifest, args.cohort ?? `s11-pending-${Date.now()}`);
  if (args.out) await writeFile(resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  print(report);
} else if (command === "resume") {
  const checkpoint = JSON.parse(await readFile(resolve(args.checkpoint), "utf8"));
  assertResumeDigests(checkpoint, { manifestDigest: contract.manifest.manifestDigest, deploymentDigest: args.deployment, infrastructureDigest: args.infrastructure });
  print({ resumed: true, checkpoint: checkpoint.id ?? null });
} else if (command === "merge") {
  const reports = await Promise.all((args.inputs ?? "").split(",").filter(Boolean).map(async (file) => JSON.parse(await readFile(resolve(file), "utf8"))));
  const merged = reports.flatMap((report) => report.runs ?? []);
  print({ status: "qualification_completed", manifestVersion: 4, evidenceSchemaVersion: 3, runs: merged, machineVerdict: "EVIDENCE_PENDING", approvalStatus: "PENDING" });
} else if (command === "regression") {
  const report = await readReport(args.report);
  const result = await evaluateSprint11(report, { contract });
  print({ ...result, regression: true });
} else if (command === "gate") {
  const report = await readReport(args.report);
  const result = await evaluateSprint11(report, { contract, requireApprovals: true });
  print({ ...result, checkedAt: new Date().toISOString() });
  process.exitCode = result.machineVerdict === "FAIL" ? 1 : result.machineVerdict === "EVIDENCE_PENDING" ? 2 : 0;
} else if (command === "report") {
  const report = await readReport(args.report);
  const result = await evaluateSprint11(report, { contract });
  print({ ...report, ...result });
} else if (command === "self-test") {
  const errors = validateSprint11Manifest(contract.manifest);
  const invalid = validateSprint11Manifest({ ...contract.manifest, manifestVersion: 3 });
  if (!invalid.some((error) => error.includes("manifestVersion")) || errors.length) throw new Error("Sprint 11 self-test failed");
  print({ status: "self_test_pass", manifestVersion: 4, evidenceSchemaVersion: 3 });
} else {
  throw new Error(`Unknown Sprint 11 command: ${command}`);
}

function pendingReport(manifest, cohortId) {
  return { status: "qualification_completed", manifestVersion: 4, evidenceSchemaVersion: 3, manifestDigest: manifest.manifestDigest ?? digest(manifest), cohortId, baseline: { revision: manifest.baseline.revision }, candidate: { revision: manifest.candidate.revision }, runs: [], machineVerdict: "EVIDENCE_PENDING", approvalStatus: "PENDING", qualificationStatus: "EVIDENCE_PENDING" };
}
async function readReport(path) { return JSON.parse(await readFile(resolve(path ?? "benchmarks/evidence/sprint-11/qualification-report.json"), "utf8")); }
function print(value) { console.log(JSON.stringify(value, null, 2)); }
function parseArgs(values) { const parsed = {}; for (let i = 0; i < values.length; i++) { if (!values[i].startsWith("--")) continue; const key = values[i].slice(2); const next = values[i + 1]; parsed[key] = next && !next.startsWith("--") ? values[++i] : true; } return parsed; }
function gitRevision() { try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unresolved"; } }
function gitStatus() { try { return execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).split("\n").filter(Boolean); } catch { return []; } }
