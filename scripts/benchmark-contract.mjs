import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const MANIFEST_PATH = "benchmarks/manifest.json";

export async function loadBenchmarkContract({
  manifestPath = MANIFEST_PATH,
  profilesPath = "benchmarks/profiles.json",
  scenariosPath = "benchmarks/scenarios.json",
} = {}) {
  const [manifest, profiles, scenarios] = await Promise.all([
    readJson(manifestPath),
    readJson(profilesPath),
    readJson(scenariosPath),
  ]);
  const errors = [];
  if (manifest.version !== 3) errors.push("manifest.version must be 3");
  if (manifest.evidenceSchemaVersion !== 2) errors.push("manifest.evidenceSchemaVersion must be 2");
  if (manifest.windowPolicy?.timezone !== "UTC")
    errors.push("manifest.windowPolicy.timezone must be UTC");
  if (!Number.isFinite(manifest.windowPolicy?.minimumSeparationMinutes))
    errors.push("manifest.windowPolicy.minimumSeparationMinutes is required");
  for (const window of manifest.windows ?? []) {
    const definition = manifest.windowPolicy?.definitions?.[window];
    if (
      !Number.isInteger(definition?.startHour) ||
      !Number.isInteger(definition?.endHour) ||
      definition.startHour < 0 ||
      definition.endHour > 24 ||
      definition.startHour >= definition.endHour
    )
      errors.push(`manifest window ${window} has invalid UTC boundaries`);
  }
  if (profiles.version !== manifest.version)
    errors.push("profiles.version must match manifest.version");
  if (scenarios.version !== manifest.version)
    errors.push("scenarios.version must match manifest.version");
  for (const profile of profiles.profiles ?? []) {
    if (!manifest.profiles.includes(profile.id))
      errors.push(`profile ${profile.id} is not in manifest`);
  }
  for (const profile of manifest.profiles ?? []) {
    if (!profiles.profiles?.some((entry) => entry.id === profile))
      errors.push(`manifest profile ${profile} is missing from profiles.json`);
  }
  for (const scenario of scenarios.scenarios ?? []) {
    if (!manifest.scenarios.includes(scenario.id))
      errors.push(`scenario ${scenario.id} is not in manifest`);
    if (!["http", "control"].includes(scenario.adapter))
      errors.push(`scenario ${scenario.id} adapter is not executable`);
    if (!scenario.primaryMetric) errors.push(`scenario ${scenario.id} primaryMetric is required`);
    if (scenario.adapter === "http" && !scenario.outcome?.required)
      errors.push(`HTTP scenario ${scenario.id} outcome contract is required`);
    if (!Array.isArray(scenario.requiredEvents) || scenario.requiredEvents.length < 2)
      errors.push(`scenario ${scenario.id} requiredEvents are missing`);
    if (
      !Array.isArray(scenario.requiredMetrics) ||
      !scenario.requiredMetrics.includes(scenario.primaryMetric)
    )
      errors.push(`scenario ${scenario.id} requiredMetrics must include primaryMetric`);
  }
  for (const scenario of manifest.scenarios ?? []) {
    if (!scenarios.scenarios?.some((entry) => entry.id === scenario))
      errors.push(`manifest scenario ${scenario} is missing from scenarios.json`);
  }
  if (new Set(manifest.scenarios ?? []).size !== manifest.scenarios?.length)
    errors.push("manifest scenarios must be unique");
  if (
    new Set((scenarios.scenarios ?? []).map((entry) => entry.id)).size !==
    scenarios.scenarios?.length
  )
    errors.push("scenario IDs must be unique");
  if (manifest.scenarios?.length !== 7 || scenarios.scenarios?.length !== 7)
    errors.push("exactly seven headline scenarios are required");
  if (errors.length) throw new Error(`Invalid benchmark contract: ${errors.join("; ")}`);
  return { manifest, profiles, scenarios };
}

export function validateCapturedReport(report, contract) {
  const errors = [];
  const { manifest, profiles, scenarios } = contract;
  const scenarioIds = new Set(scenarios.scenarios.map((entry) => entry.id));
  const profileIds = new Set(profiles.profiles.map((entry) => entry.id));
  const runs = normalizeRuns(report);
  if (!runs.length) errors.push("report must contain at least one run");
  for (const [index, run] of runs.entries()) {
    const prefix = `run ${run.runId ?? index + 1}`;
    const required = [
      "status",
      "manifestVersion",
      "scenario",
      "scenarioVersion",
      "profile",
      "window",
      "mode",
      "temperature",
      "runId",
      "revision",
      "capturedAt",
      "region",
      "runtime",
      "network",
      "dependencyVersions",
      "dependencyEndpoints",
      "payloadIdentity",
      "datasetIdentity",
      "workload",
      "pacing",
      "saturation",
      "attemptedSamples",
      "successfulSamples",
      "errorSamples",
      "throughput",
      "errorTaxonomy",
      "http503",
      "latencyMs",
    ];
    for (const key of required)
      if (
        run[key] === undefined &&
        !(key === "manifestVersion" && report.manifestVersion !== undefined)
      )
        errors.push(`${prefix}: missing ${key}`);
    if (run.status !== "captured") errors.push(`${prefix}: status must be captured`);
    const manifestVersion = run.manifestVersion ?? report.manifestVersion;
    if (manifestVersion !== manifest.version)
      errors.push(`${prefix}: manifestVersion does not match manifest`);
    if (!scenarioIds.has(run.scenario)) errors.push(`${prefix}: unknown scenario ${run.scenario}`);
    if (!profileIds.has(run.profile)) errors.push(`${prefix}: unknown profile ${run.profile}`);
    if (!manifest.windows.includes(run.window))
      errors.push(`${prefix}: invalid window ${run.window}`);
    if (!manifest.modes.filter((mode) => mode !== "dry-run").includes(run.mode))
      errors.push(`${prefix}: invalid capture mode ${run.mode}`);
    if (!manifest.temperatures.includes(run.temperature))
      errors.push(`${prefix}: invalid temperature ${run.temperature}`);
    if (!Number.isInteger(run.attemptedSamples) || run.attemptedSamples < 1)
      errors.push(`${prefix}: attemptedSamples must be a positive integer`);
    if (
      !Number.isInteger(run.successfulSamples) ||
      run.successfulSamples < 0 ||
      run.successfulSamples > run.attemptedSamples
    )
      errors.push(`${prefix}: invalid successfulSamples`);
    if (run.errorSamples !== run.attemptedSamples - run.successfulSamples)
      errors.push(`${prefix}: errorSamples must equal attemptedSamples - successfulSamples`);
    if (
      run.workload?.attemptedSamples !== run.attemptedSamples ||
      run.workload?.successfulSamples !== run.successfulSamples
    )
      errors.push(`${prefix}: workload counters do not match report counters`);
    if (run.pacing?.targetRequestsPerSecond !== run.workload?.targetRequestsPerSecond)
      errors.push(`${prefix}: pacing target does not match workload target`);
    if (!Number.isFinite(run.pacing?.achievedRequestsPerSecond))
      errors.push(`${prefix}: achieved arrival rate must be finite`);
    if (
      !Number.isInteger(run.saturation?.saturatedArrivals) ||
      run.saturation.saturatedArrivals < 0
    )
      errors.push(`${prefix}: invalid saturation count`);
    if (run.http503?.count !== (run.errorTaxonomy?.http_5xx_503 ?? 0))
      errors.push(`${prefix}: http503.count must match errorTaxonomy.http_5xx_503`);
    for (const field of ["p50", "p95", "p99"])
      if (!Number.isFinite(run.latencyMs?.[field]))
        errors.push(`${prefix}: latencyMs.${field} must be finite`);
    const taxonomyTotal = Object.values(run.errorTaxonomy ?? {}).reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0,
    );
    if (taxonomyTotal !== run.errorSamples)
      errors.push(`${prefix}: error taxonomy total must equal errorSamples`);
    if (run.http503?.unattributedCount !== run.http503?.count - run.http503?.attributedCount)
      errors.push(`${prefix}: invalid 503 attribution counters`);
    if (!run.revision || run.revision === "unresolved")
      errors.push(`${prefix}: revision is unresolved`);
    if (!run.capturedAt || Number.isNaN(Date.parse(run.capturedAt)))
      errors.push(`${prefix}: capturedAt must be an ISO timestamp`);
    if (run.mode === "fixture")
      errors.push(`${prefix}: fixture output cannot be captured evidence`);
  }
  return errors;
}

export function normalizeRuns(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.runs)) return value.runs;
  if (value?.scenario) return [value];
  return [];
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}
