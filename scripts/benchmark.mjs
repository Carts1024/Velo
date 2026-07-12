#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { loadBenchmarkContract } from "./benchmark-contract.mjs";
import { runOpenLoop } from "./benchmark-runner-lib.mjs";

// Load environment variables using process.loadEnvFile
const envFiles = [".env", ".env.local", ".env.benchmark", "apps/web/.env.local"];
for (const file of envFiles) {
  const path = resolve(file);
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path);
    } catch {
      // Ignore
    }
  }
}

// Git revision helper
function getGitRevision() {
  try {
    return execSync("git rev-parse HEAD", { stdio: "pipe" }).toString().trim();
  } catch {
    return "unresolved";
  }
}

// Pinned dependencies helper
function getDependencyVersions() {
  try {
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    return `node@${process.version}, ${pkg.packageManager ?? "unknown"}`;
  } catch {
    return "unresolved";
  }
}

// Default values for local/dry-run execution
const defaultEnv = {
  VELO_BENCHMARK_BASE_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  VELO_BENCHMARK_API_KEY: "mock-api-key",
  VELO_BENCHMARK_CHECKOUT_URL: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/checkout`,
  VELO_BENCHMARK_SIGNED_XDR: "AAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  VELO_BENCHMARK_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
  VELO_BENCHMARK_CORRELATION_ID: "mock-correlation-id",
  VELO_BENCHMARK_REGION: "local",
  VELO_BENCHMARK_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet",
  VELO_BENCHMARK_DEPENDENCY_VERSIONS: getDependencyVersions(),
  VELO_BENCHMARK_DEPENDENCY_ENDPOINTS: "unresolved",
  VELO_BENCHMARK_PAYLOAD_IDENTITY: "payment-intent-create-v2-usdc-1.00",
  VELO_BENCHMARK_DATASET_IDENTITY: "authorized-fixture-required",
  VELO_BENCHMARK_REVISION: getGitRevision(),
};

for (const [key, value] of Object.entries(defaultEnv)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const args = parseArgs(process.argv.slice(2));
const configPath = resolve(args.config ?? "benchmarks/scenarios.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const contract = await loadBenchmarkContract();
const selectedScenarios = selectScenarios(config.scenarios, args);
const outputs = [];

for (const scenario of selectedScenarios) {
  outputs.push(await runScenario(scenario, args));
}

const output = args.suite
  ? {
      status: args["dry-run"] ? "suite_validated" : "suite_completed",
      capturedAt: new Date().toISOString(),
      scenarios: outputs,
    }
  : outputs[0];
await writeResult(args.out, output);
console.log(JSON.stringify(output, null, 2));

function selectScenarios(scenarios, parsedArgs) {
  if (parsedArgs.suite) return scenarios;
  const scenario = scenarios.find((entry) => entry.id === (parsedArgs.scenario ?? "payment-intent-create"));
  if (!scenario) throw new Error(`Unknown scenario: ${parsedArgs.scenario}`);
  return [scenario];
}

async function runScenario(scenario, parsedArgs) {
  const profile = getProfile(contract.profiles, parsedArgs.profile ?? process.env.VELO_BENCHMARK_PROFILE ?? contract.manifest.defaultProfile);
  const requestedSamples = asPositiveInt(parsedArgs.samples ?? "1000", "samples");
  if (profile.sampleTarget && requestedSamples < profile.sampleTarget) throw new Error(`${profile.id} requires at least ${profile.sampleTarget} samples; received ${requestedSamples}`);
  const durationSamples = Math.ceil(
    (profile.requestsPerSecond ?? 1) * (profile.durationSeconds ?? 0),
  );
  const samples = parsedArgs["dry-run"]
    ? requestedSamples
    : Math.max(requestedSamples, profile.sampleTarget ?? 0, durationSamples);
  const concurrency = asPositiveInt(parsedArgs.concurrency ?? String(profile.concurrency ?? 1), "concurrency");
  const timeoutMs = asPositiveInt(
    parsedArgs["timeout-ms"] ?? process.env.VELO_BENCHMARK_TIMEOUT_MS ?? "10000",
    "timeout-ms",
  );
  if (concurrency !== profile.concurrency) throw new Error(`${profile.id} requires concurrency ${profile.concurrency}; received ${concurrency}`);
  const window = getAllowed(args.window ?? process.env.VELO_BENCHMARK_WINDOW ?? "morning", contract.manifest.windows, "window");
  const mode = args["dry-run"] ? "dry-run" : getAllowed(args.mode ?? process.env.VELO_BENCHMARK_MODE ?? "capture", contract.manifest.modes, "mode");
  const temperature = getAllowed(
    args.temperature ?? process.env.VELO_BENCHMARK_TEMPERATURE ?? "warm",
    contract.manifest.temperatures,
    "temperature",
  );
  if (args["dry-run"] && args.mode && args.mode !== "dry-run") throw new Error("--dry-run conflicts with --mode");
  const metadata = scenarioMetadata(scenario, profile, window, mode, temperature, samples, concurrency, timeoutMs);
  const missingEnv = (scenario.requiredEnv ?? []).filter((name) => !process.env[name]);

  if (scenario.adapter !== "http") {
    return fixtureContractOutput(scenario, metadata, missingEnv, Boolean(parsedArgs["dry-run"]));
  }

  if (parsedArgs["dry-run"]) {
    return {
      status: "validated",
      ...metadata,
      adapter: scenario.adapter,
      requiredEnv: scenario.requiredEnv ?? [],
      missingEnv,
      samples: [],
    };
  }

  if (missingEnv.length > 0) {
    throw new Error(`${scenario.id} missing required benchmark environment: ${missingEnv.join(", ")}`);
  }

  const wallStartedAt = performance.now();
  const openLoop = await runOpenLoop(samples, concurrency, profile.requestsPerSecond, (sample, scheduledAt) =>
    captureHttpSample(scenario, metadata.runId, sample, timeoutMs, scheduledAt),
  );
  const samplesOut = openLoop.results;
  const wallDurationMs = performance.now() - wallStartedAt;
  const successful = samplesOut.filter((sample) => sample.status >= 200 && sample.status < 400);
  const errorTaxonomy = countErrors(samplesOut);
  const http503 = summarize503(samplesOut);
  const durations = successful.map((sample) => sample.durationMs).sort((left, right) => left - right);

  return {
    status: "captured",
    ...metadata,
    adapter: scenario.adapter,
    workload: {
      ...metadata.workload,
      attemptedSamples: samplesOut.length,
      successfulSamples: successful.length,
    },
    pacing: {
      targetRequestsPerSecond: profile.requestsPerSecond,
      achievedRequestsPerSecond: round((samplesOut.length / Math.max(wallDurationMs, 1)) * 1000),
    },
    saturation: {
      saturatedArrivals: openLoop.saturatedArrivals,
      maxInFlight: openLoop.maxInFlight,
    },
    successfulSamples: successful.length,
    attemptedSamples: samplesOut.length,
    errorSamples: samplesOut.length - successful.length,
    errors: samplesOut.length - successful.length,
    timeouts: samplesOut.filter((sample) => sample.timeout).length,
    wallDurationMs: round(wallDurationMs),
    throughputPerSecond: round((samplesOut.length / Math.max(wallDurationMs, 1)) * 1000),
    throughput: {
      attemptedPerSecond: round((samplesOut.length / Math.max(wallDurationMs, 1)) * 1000),
      successfulPerSecond: round((successful.length / Math.max(wallDurationMs, 1)) * 1000),
    },
    errorTaxonomy,
    http503,
    latencyMs: percentiles(durations),
    samples: samplesOut,
  };
}

function scenarioMetadata(scenario, profile, window, mode, temperature, samples, concurrency, timeoutMs) {
  return {
    scenario: scenario.id,
    journey: scenario.journey,
    revision: process.env.GITHUB_SHA ?? process.env.VELO_BENCHMARK_REVISION ?? "unresolved",
    capturedAt: new Date().toISOString(),
    region: process.env.VELO_BENCHMARK_REGION ?? "unresolved",
    runtime: process.version,
    network: process.env.VELO_BENCHMARK_NETWORK ?? "unresolved",
    dependencyVersions: process.env.VELO_BENCHMARK_DEPENDENCY_VERSIONS ?? "unresolved",
    dependencyEndpoints: process.env.VELO_BENCHMARK_DEPENDENCY_ENDPOINTS ?? "unresolved",
    payloadIdentity: process.env.VELO_BENCHMARK_PAYLOAD_IDENTITY ?? "unresolved",
    datasetIdentity: process.env.VELO_BENCHMARK_DATASET_IDENTITY ?? "unresolved",
    scenarioVersion: scenario.version ?? 2,
    sampleSize: samples,
    concurrency,
    timeoutMs,
    profile: profile.id,
    window,
    mode,
    temperature,
    manifestVersion: 3,
    workload: {
      requestedSamples: samples,
      attemptedSamples: 0,
      successfulSamples: 0,
      concurrency,
      timeoutMs,
      targetRequestsPerSecond: profile.requestsPerSecond ?? null,
      durationSeconds: profile.durationSeconds ?? null,
    },
    runId: crypto.randomUUID(),
  };
}

function fixtureContractOutput(scenario, metadata, missingEnv, dryRun) {
  return {
    status: dryRun ? "fixture_contract_validated" : "fixture_capture_required",
    ...metadata,
    adapter: scenario.adapter,
    requiredEnv: scenario.requiredEnv ?? [],
    missingEnv,
    fixture: scenario.fixture,
    samples: [],
    note: "This adapter records no latency until its declared fixture is supplied; it is never included in a speed claim.",
  };
}

async function captureHttpSample(scenario, runId, sample, timeoutMs, scheduledAt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${process.env.VELO_BENCHMARK_BASE_URL}${scenario.path}`, {
      method: scenario.method,
      headers: {
        Authorization: `Bearer ${process.env.VELO_BENCHMARK_API_KEY}`,
        "x-correlation-id": `bench-${runId}-${sample}`,
        ...replaceVariables(scenario.headers ?? {}, { RUN_ID: runId, SAMPLE: String(sample) }),
      },
      ...(scenario.body ? { body: JSON.stringify(scenario.body) } : {}),
      signal: controller.signal,
    });
    const error = response.status >= 200 && response.status < 400 ? null : classifyHttpError(response.status, response.headers);
    return {
      sample,
      scheduledAt,
      queueDelayMs: round(Math.max(0, startedAt - scheduledAt)),
      durationMs: round(performance.now() - startedAt),
      status: response.status,
      timeout: false,
      correlationId: response.headers.get("x-correlation-id"),
      error,
    };
  } catch (error) {
    return {
      sample,
      scheduledAt,
      queueDelayMs: round(Math.max(0, startedAt - scheduledAt)),
      durationMs: round(performance.now() - startedAt),
      status: 0,
      timeout: controller.signal.aborted,
      error: null,
      errorDetail: { class: controller.signal.aborted ? "timeout" : "network", code: error instanceof Error ? error.name : "request_failed" },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getProfile(profiles, id) {
  const profile = profiles.profiles.find((entry) => entry.id === id);
  if (!profile) throw new Error(`Unknown benchmark profile: ${id}`);
  return profile;
}

function getAllowed(value, allowed, name) {
  if (!allowed.includes(value)) throw new Error(`Invalid benchmark ${name}: ${value}`);
  return value;
}

function classifyHttpError(status, headers) {
  const errorClass = status >= 400 && status < 500 ? "http_4xx" : status >= 500 ? (status === 503 ? "http_5xx_503" : "http_5xx") : "unknown";
  return { class: errorClass, code: headers.get("x-error-code"), dependency: headers.get("x-error-dependency"), source: headers.get("x-error-source"), attributed: Boolean(headers.get("x-error-dependency") || headers.get("x-error-source")) };
}

function countErrors(samples) {
  const counts = { timeout: 0, http_4xx: 0, http_5xx: 0, http_5xx_503: 0, network: 0, unknown: 0 };
  for (const sample of samples) {
    if (sample.status >= 200 && sample.status < 400) continue;
    const key = sample.error?.class ?? sample.errorDetail?.class ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function summarize503(samples) {
  const errors = samples.map((sample) => sample.error).filter((error) => error?.class === "http_5xx_503");
  const byDependency = {};
  for (const error of errors) if (error.dependency) byDependency[error.dependency] = (byDependency[error.dependency] ?? 0) + 1;
  const attributedCount = errors.filter((error) => error.attributed).length;
  return { count: errors.length, attributedCount, unattributedCount: errors.length - attributedCount, byDependency };
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

function asPositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function percentiles(sorted) {
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}

function replaceVariables(headers, values) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      String(value).replace(/\$\{(RUN_ID|SAMPLE)\}/g, (_, name) => values[name]),
    ]),
  );
}

async function writeResult(out, output) {
  if (!out) return;
  const outputPath = resolve(out);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
