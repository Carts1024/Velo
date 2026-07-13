#!/usr/bin/env node

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

import { loadBenchmarkContract } from "./benchmark-contract.mjs";
import { deriveVeloContributors } from "./benchmark-gate-lib.mjs";
import { runOpenLoop } from "./benchmark-runner-lib.mjs";
import { createScenarioAdapter } from "./benchmark/adapters.mjs";
import {
  EVIDENCE_SCHEMA_VERSION,
  summarizeLifecycleSamples,
  writeNdjsonArtifact,
} from "./benchmark/lifecycle.mjs";

loadEnvironment();
const args = parseArgs(process.argv.slice(2));
const contract = await loadBenchmarkContract({
  scenariosPath: args.config ?? "benchmarks/scenarios.json",
});
const cells = selectCells(contract, args);

if (args["dry-run"]) {
  const output = {
    status: "suite_validated",
    manifestVersion: contract.manifest.version,
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    cells: cells.map((cell) => ({
      ...cell,
      adapter: cell.scenarioConfig.adapter,
      requiredEnv: cell.scenarioConfig.requiredEnv,
      missingEnv: cell.scenarioConfig.requiredEnv.filter((name) => !process.env[name]),
    })),
  };
  await writeOptionalJson(args.out, output, false);
  console.log(JSON.stringify(output, null, 2));
} else {
  const outputPath = requirePath(args.out, "--out is required for capture evidence");
  const samplesPath = requirePath(
    args["samples-out"],
    "--samples-out is required for raw NDJSON capture evidence",
  );
  assertArtifactPaths(outputPath, samplesPath);
  const evidence = loadEvidenceMetadata(contract);
  const captureId = randomUUID();
  const cohortId = process.env.VELO_BENCHMARK_COHORT_ID;
  const revision = process.env.GITHUB_SHA ?? process.env.VELO_BENCHMARK_REVISION ?? gitRevision();
  const captureStartedAt = new Date().toISOString();
  const rawSamples = [];
  const runs = [];
  for (const cell of cells) {
    const result = await captureCell(cell, contract, captureId);
    runs.push(result.run);
    rawSamples.push(...result.samples);
  }
  const absoluteSamplesPath = resolve(samplesPath);
  const artifact = await writeNdjsonArtifact(absoluteSamplesPath, rawSamples);
  artifact.path =
    relative(dirname(resolve(outputPath)), absoluteSamplesPath) || basename(absoluteSamplesPath);
  const captureCompletedAt = new Date().toISOString();
  const output = {
    status: args.matrix ? "window_completed" : "suite_completed",
    captureId,
    cohortId,
    revision,
    manifestVersion: contract.manifest.version,
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    startedAt: captureStartedAt,
    completedAt: captureCompletedAt,
    capturedAt: captureCompletedAt,
    baseline: evidence.baseline,
    contributors: deriveVeloContributors(rawSamples),
    sampleArtifact: artifact,
    runs,
  };
  await writeOptionalJson(outputPath, output, true);
  console.log(JSON.stringify(output, null, 2));
}

async function captureCell(cell, currentContract, captureId) {
  const scenario = cell.scenarioConfig;
  const profile = currentContract.profiles.profiles.find((entry) => entry.id === cell.profile);
  const requested = positiveInt(args.samples ?? "1000", "samples");
  const durationSamples = Math.ceil(profile.requestsPerSecond * profile.durationSeconds);
  const targetSamples = Math.max(requested, profile.sampleTarget, durationSamples);
  const concurrency = positiveInt(args.concurrency ?? String(profile.concurrency), "concurrency");
  if (concurrency !== profile.concurrency) {
    throw new Error(
      `${profile.id} requires concurrency ${profile.concurrency}; received ${concurrency}`,
    );
  }
  const timeoutMs = positiveInt(
    args["timeout-ms"] ?? process.env.VELO_BENCHMARK_TIMEOUT_MS ?? "10000",
    "timeout-ms",
  );
  requireCaptureMetadata();
  const runId = randomUUID();
  const context = {
    captureId,
    cohortId: process.env.VELO_BENCHMARK_COHORT_ID,
    runId,
    scenario: scenario.id,
    profile: cell.profile,
    temperature: cell.temperature,
    window: cell.window,
    targetSamples,
    timeoutMs,
  };
  const adapter = createScenarioAdapter(scenario);
  let fixture;
  let openLoop;
  let cleanupReceipt;
  try {
    fixture = await adapter.setup(context);
    if (
      fixture.temperatureApplied !== cell.temperature ||
      (fixture.profileApplied && fixture.profileApplied !== cell.profile)
    ) {
      throw new Error(`${scenario.id} control did not apply the requested profile/temperature`);
    }
    await adapter.prime?.(fixture, context);
    openLoop = await runOpenLoop(
      targetSamples,
      concurrency,
      profile.requestsPerSecond,
      async (sample, scheduledAt) => {
        const startedAt = performance.now();
        const captured = await adapter.execute(fixture, { ...context, sample, scheduledAt });
        return {
          manifestVersion: currentContract.manifest.version,
          evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
          captureId,
          cohortId: process.env.VELO_BENCHMARK_COHORT_ID,
          runId,
          scenario: scenario.id,
          profile: cell.profile,
          temperature: cell.temperature,
          window: cell.window,
          clockProvenance: fixture.clockProvenance,
          scheduledAtMonotonicMs: scheduledAt,
          queueDelayMs: round(Math.max(0, startedAt - scheduledAt)),
          ...captured,
        };
      },
      {
        onDrop: (sample, scheduledAt) => ({
          manifestVersion: currentContract.manifest.version,
          evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
          captureId,
          cohortId: process.env.VELO_BENCHMARK_COHORT_ID,
          runId,
          scenario: scenario.id,
          profile: cell.profile,
          temperature: cell.temperature,
          window: cell.window,
          clockProvenance: fixture.clockProvenance,
          sample,
          scheduledAtMonotonicMs: scheduledAt,
          status: "dropped",
          evidenceMode: "real",
          lifecycle: [],
          metrics: [],
          errorDetail: { class: "dropped", code: "client_saturation" },
        }),
      },
    );
  } finally {
    if (fixture) cleanupReceipt = await adapter.cleanup(fixture, context);
  }
  const samples = openLoop.results;
  const successful = samples.filter((sample) => sample.status === "success");
  const dropped = samples.filter((sample) => sample.status === "dropped");
  const errors = samples.filter((sample) => sample.status === "error");
  const lifecycle = summarizeLifecycleSamples(samples, scenario.primaryMetric);
  const taxonomy = countErrors(samples);
  const http503 = summarize503(samples);
  const arrivalSeconds = Math.max(openLoop.arrivalDurationMs / 1000, 0.001);
  const wallSeconds = Math.max(openLoop.wallDurationMs / 1000, 0.001);
  const metadata = captureMetadata();
  return {
    samples,
    run: {
      status: "captured",
      evidenceMode: "real",
      manifestVersion: currentContract.manifest.version,
      evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
      captureId,
      runId,
      scenario: scenario.id,
      scenarioVersion: scenario.version,
      adapter: scenario.adapter,
      profile: cell.profile,
      temperature: cell.temperature,
      window: cell.window,
      mode: "capture",
      capturedAt: new Date().toISOString(),
      ...metadata,
      clockProvenance: fixture.clockProvenance,
      fixtureControl: {
        ...fixture.fixtureControl,
        cleanup: cleanupReceipt,
      },
      coldReset: {
        required: cell.temperature === "cold",
        verifiedSamples: successful.filter(
          (sample) => sample.coldResetEvidence?.attestation?.verified === true,
        ).length,
        methods: [
          ...new Set(
            successful
              .map((sample) => sample.coldResetEvidence?.method)
              .filter((method) => typeof method === "string"),
          ),
        ],
      },
      workload: {
        requestedSamples: targetSamples,
        attemptedSamples: samples.length,
        successfulSamples: successful.length,
        concurrency,
        timeoutMs,
        targetRequestsPerSecond: profile.requestsPerSecond,
        durationSeconds: profile.durationSeconds,
      },
      pacing: {
        targetRequestsPerSecond: profile.requestsPerSecond,
        achievedRequestsPerSecond: round(Math.max(samples.length - 1, 1) / arrivalSeconds),
      },
      saturation: {
        saturatedArrivals: openLoop.saturatedArrivals,
        droppedArrivals: dropped.length,
        maxInFlight: openLoop.maxInFlight,
      },
      attemptedSamples: samples.length,
      successfulSamples: successful.length,
      errorSamples: errors.length,
      droppedSamples: dropped.length,
      throughput: {
        attemptedPerSecond: round(samples.length / wallSeconds),
        successfulPerSecond: round(successful.length / wallSeconds),
      },
      errorTaxonomy: taxonomy,
      http503,
      latencyMs: lifecycle.latencyMs,
      lifecycleMetrics: lifecycle.lifecycleMetrics,
      dependencyTimingMs: lifecycle.dependencyTimingMs,
      queueDepth: lifecycle.queueDepth,
      eventLagMs: lifecycle.eventLagMs,
    },
  };
}

function selectCells(currentContract, parsedArgs) {
  const scenarios =
    parsedArgs.matrix || parsedArgs.suite
      ? currentContract.scenarios.scenarios
      : [
          currentContract.scenarios.scenarios.find(
            (scenario) => scenario.id === (parsedArgs.scenario ?? "payment-intent-create"),
          ),
        ];
  if (scenarios.some((scenario) => !scenario))
    throw new Error(`Unknown scenario: ${parsedArgs.scenario}`);
  if (parsedArgs.matrix) {
    if (!parsedArgs.window || !currentContract.manifest.windows.includes(parsedArgs.window)) {
      throw new Error("--matrix requires one explicit --window: morning, afternoon, or evening");
    }
    return scenarios.flatMap((scenario) =>
      currentContract.manifest.qualificationProfiles.flatMap((profile) =>
        currentContract.manifest.temperatures.flatMap((temperature) =>
          [parsedArgs.window].map((window) => ({
            scenario: scenario.id,
            scenarioConfig: scenario,
            profile,
            temperature,
            window,
          })),
        ),
      ),
    );
  }
  const profile =
    parsedArgs.profile ??
    process.env.VELO_BENCHMARK_PROFILE ??
    currentContract.manifest.defaultProfile;
  const temperature = parsedArgs.temperature ?? process.env.VELO_BENCHMARK_TEMPERATURE ?? "warm";
  const window = parsedArgs.window ?? process.env.VELO_BENCHMARK_WINDOW ?? "morning";
  if (!currentContract.manifest.profiles.includes(profile))
    throw new Error(`Unknown profile: ${profile}`);
  if (!currentContract.manifest.temperatures.includes(temperature))
    throw new Error(`Invalid temperature: ${temperature}`);
  if (!currentContract.manifest.windows.includes(window))
    throw new Error(`Invalid window: ${window}`);
  return scenarios.map((scenario) => ({
    scenario: scenario.id,
    scenarioConfig: scenario,
    profile,
    temperature,
    window,
  }));
}

function requireCaptureMetadata() {
  const required = [
    "VELO_BENCHMARK_REGION",
    "VELO_BENCHMARK_NETWORK",
    "VELO_BENCHMARK_DEPENDENCY_ENDPOINTS",
    "VELO_BENCHMARK_PAYLOAD_IDENTITY",
    "VELO_BENCHMARK_DATASET_IDENTITY",
    "VELO_BENCHMARK_AUTHORIZATION_ID",
    "VELO_BENCHMARK_COHORT_ID",
  ];
  const missing = required.filter(
    (name) => !process.env[name] || process.env[name] === "unresolved",
  );
  if (missing.length) throw new Error(`capture metadata is unresolved: ${missing.join(", ")}`);
}

function captureMetadata() {
  return {
    revision: process.env.GITHUB_SHA ?? process.env.VELO_BENCHMARK_REVISION ?? gitRevision(),
    region: process.env.VELO_BENCHMARK_REGION,
    runtime: process.version,
    network: process.env.VELO_BENCHMARK_NETWORK,
    dependencyVersions: process.env.VELO_BENCHMARK_DEPENDENCY_VERSIONS ?? dependencyVersions(),
    dependencyEndpoints: process.env.VELO_BENCHMARK_DEPENDENCY_ENDPOINTS,
    payloadIdentity: process.env.VELO_BENCHMARK_PAYLOAD_IDENTITY,
    datasetIdentity: process.env.VELO_BENCHMARK_DATASET_IDENTITY,
    cohortId: process.env.VELO_BENCHMARK_COHORT_ID,
  };
}

function loadEvidenceMetadata(currentContract) {
  try {
    const baseline = JSON.parse(process.env.VELO_BENCHMARK_BASELINE_JSON ?? "");
    if (
      !baseline?.id ||
      !baseline?.revision ||
      !baseline?.artifact ||
      !/^[a-f0-9]{64}$/.test(baseline?.sha256 ?? "") ||
      Number.isNaN(Date.parse(baseline?.capturedAt)) ||
      currentContract.manifest.scenarios.some(
        (scenario) => !Number.isFinite(baseline?.scenarios?.[scenario]?.p95),
      )
    ) {
      throw new Error();
    }
    return { baseline };
  } catch {
    throw new Error("capture requires a complete VELO_BENCHMARK_BASELINE_JSON");
  }
}

function assertArtifactPaths(outputPath, samplesPath) {
  const report = resolve(outputPath);
  const samples = resolve(samplesPath);
  const relativeSamples = relative(dirname(report), samples);
  if (report === samples || relativeSamples.startsWith("..") || relativeSamples === "") {
    throw new Error("--samples-out must be a distinct path inside the report directory");
  }
  if (existsSync(report) || existsSync(samples)) {
    throw new Error("capture evidence paths already exist; qualification artifacts are immutable");
  }
}

function countErrors(samples) {
  const counts = {
    timeout: 0,
    http_4xx: 0,
    http_5xx: 0,
    http_5xx_503: 0,
    network: 0,
    lifecycle: 0,
    authorization: 0,
    dropped: 0,
    unknown: 0,
  };
  for (const sample of samples) {
    if (sample.status === "success") continue;
    const key = sample.error?.class ?? sample.errorDetail?.class ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function summarize503(samples) {
  const errors = samples
    .map((sample) => sample.error)
    .filter((error) => error?.class === "http_5xx_503");
  const byDependency = {};
  for (const error of errors)
    if (error.dependency)
      byDependency[error.dependency] = (byDependency[error.dependency] ?? 0) + 1;
  const attributedCount = errors.filter((error) => error.attributed).length;
  return {
    count: errors.length,
    attributedCount,
    unattributedCount: errors.length - attributedCount,
    byDependency,
  };
}

function loadEnvironment() {
  for (const file of [".env", ".env.local", ".env.benchmark"]) {
    if (!existsSync(resolve(file)) || typeof process.loadEnvFile !== "function") continue;
    try {
      process.loadEnvFile(resolve(file));
    } catch {}
  }
}

function gitRevision() {
  try {
    return execSync("git rev-parse HEAD", { stdio: "pipe" }).toString().trim();
  } catch {
    return "unresolved";
  }
}

function dependencyVersions() {
  try {
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    return `node@${process.version}, ${pkg.packageManager ?? "unknown"}`;
  } catch {
    return "unresolved";
  }
}

async function writeOptionalJson(path, value, exclusive) {
  if (!path) return;
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(value, null, 2)}\n`,
    exclusive ? { flag: "wx" } : undefined,
  );
}

function requirePath(value, message) {
  if (!value || value === true) throw new Error(message);
  return value;
}

function positiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
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

function round(value) {
  return Math.round(value * 100) / 100;
}
