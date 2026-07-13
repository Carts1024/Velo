import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";

import { loadBenchmarkContract } from "./benchmark-contract.mjs";
import {
  summarizeDurations,
  validateClockProvenance,
  validateColdResetEvidence,
  validateLifecycleSample,
} from "./benchmark/lifecycle.mjs";

export function buildQualificationCells(contract) {
  const cells = [];
  for (const scenario of contract.manifest.scenarios) {
    for (const profile of contract.manifest.qualificationProfiles) {
      for (const temperature of contract.manifest.temperatures) {
        for (const window of contract.manifest.windows) {
          cells.push({ scenario, profile, temperature, window });
        }
      }
    }
  }
  return cells;
}

export async function evaluateBenchmarkReport(
  report,
  { contract, artifactIndex, baselineIndex, rejectOverrides = false } = {},
) {
  contract ??= await loadBenchmarkContract();
  const failures = [];
  const { manifest, scenarios } = contract;
  if (rejectOverrides)
    failures.push("qualification thresholds are locked; CLI overrides are forbidden");
  if (report?.status !== "suite_completed") failures.push("report status must be suite_completed");
  if (report?.manifestVersion !== manifest.version)
    failures.push("report manifestVersion is invalid");
  if (report?.evidenceSchemaVersion !== manifest.evidenceSchemaVersion) {
    failures.push("report evidenceSchemaVersion is invalid");
  }
  if (!validIso(report?.capturedAt)) failures.push("report capturedAt must be an ISO timestamp");
  if (!report?.cohortId) failures.push("report cohortId is required");
  if (!report?.revision || report.revision === "unresolved")
    failures.push("report revision is required");
  validateBaseline(report?.baseline, manifest, failures);
  validateBaselineEvidence(report?.baseline, baselineIndex, manifest, failures);
  validateContributors(report?.contributors, artifactIndex?.contributors, manifest, failures);

  const expectedCells = buildQualificationCells(contract);
  const expectedKeys = new Set(expectedCells.map(cellKey));
  if (expectedKeys.size !== manifest.thresholds.requiredQualificationCells) {
    failures.push("manifest qualification cell count is inconsistent");
  }
  const runs = Array.isArray(report?.runs) ? report.runs : [];
  validateSourceCaptures(report?.sourceCaptures, runs, report, manifest, failures);
  if (runs.length !== expectedCells.length) {
    failures.push(
      `requires exactly ${expectedCells.length} qualification runs; found ${runs.length}`,
    );
  }
  const scenarioById = new Map(scenarios.scenarios.map((scenario) => [scenario.id, scenario]));
  const seenCells = new Set();
  const seenRunIds = new Set();
  let totalSuccessful = 0;
  let totalAttempted = 0;
  for (const [index, run] of runs.entries()) {
    const label = `run ${run?.runId ?? index + 1}`;
    const key = cellKey(run ?? {});
    if (!expectedKeys.has(key)) failures.push(`${label}: unexpected qualification cell ${key}`);
    else if (seenCells.has(key)) failures.push(`${label}: duplicate qualification cell ${key}`);
    else seenCells.add(key);
    if (!run?.runId) failures.push(`${label}: runId is required`);
    else if (seenRunIds.has(run.runId)) failures.push(`${label}: duplicate runId`);
    else seenRunIds.add(run.runId);
    validateRun(run ?? {}, scenarioById.get(run?.scenario), manifest, report, label, failures);
    totalSuccessful += Number.isInteger(run?.successfulSamples) ? run.successfulSamples : 0;
    totalAttempted += Number.isInteger(run?.attemptedSamples) ? run.attemptedSamples : 0;
  }
  for (const cell of expectedCells) {
    const key = cellKey(cell);
    if (!seenCells.has(key)) failures.push(`missing required cell ${key}`);
  }
  if (totalSuccessful < expectedCells.length * manifest.thresholds.requiredSuccessfulSamples) {
    failures.push(
      `qualification requires at least ${expectedCells.length * manifest.thresholds.requiredSuccessfulSamples} successful samples; found ${totalSuccessful}`,
    );
  }
  validateWindowIdentity(runs, failures);
  validateArtifact(report?.sampleArtifact, artifactIndex, runs, totalAttempted, failures);
  return { status: failures.length === 0 ? "pass" : "fail", failures };
}

export async function resolveSafeReportArtifact(reportPath, value, label) {
  if (!value || isAbsolute(value) || value.split(/[\\/]/).includes("..")) {
    throw new Error(`${label} path must be a safe path relative to the report`);
  }
  const reportDirectory = dirname(resolve(reportPath));
  const artifact = resolve(reportDirectory, value);
  if (!artifact.startsWith(`${reportDirectory}${sep}`)) {
    throw new Error(`${label} path escapes the report directory`);
  }
  const [artifactMetadata, realDirectory, realArtifact] = await Promise.all([
    lstat(artifact),
    realpath(reportDirectory),
    realpath(artifact),
  ]);
  if (!artifactMetadata.isFile() || artifactMetadata.isSymbolicLink()) {
    throw new Error(`${label} must be an immutable regular file, not a symbolic link`);
  }
  if (!realArtifact.startsWith(`${realDirectory}${sep}`)) {
    throw new Error(`${label} symlink escapes the report directory`);
  }
  return realArtifact;
}

export async function indexBaselineArtifact(path) {
  const bytes = await readFile(path);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

export async function indexNdjsonArtifact(
  path,
  contract,
  { controlSecret = process.env.VELO_BENCHMARK_CONTROL_SECRET } = {},
) {
  const hash = createHash("sha256");
  const scenarioById = new Map(
    contract.scenarios.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const byRun = {};
  const contributorTotals = new Map();
  const malformed = [];
  let malformedCount = 0;
  let records = 0;
  let buffer = "";
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk);
    buffer += chunk.toString("utf8");
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      records += 1;
      indexLine(
        line,
        records,
        scenarioById,
        byRun,
        malformed,
        controlSecret,
        contributorTotals,
        () => {
          malformedCount += 1;
        },
      );
    }
  }
  if (buffer.trim()) {
    records += 1;
    indexLine(
      buffer,
      records,
      scenarioById,
      byRun,
      malformed,
      controlSecret,
      contributorTotals,
      () => {
        malformedCount += 1;
      },
    );
  }
  for (const indexed of Object.values(byRun)) {
    indexed.lifecycleMetrics = Object.fromEntries(
      Object.entries(indexed.metricValues).map(([name, values]) => [
        name,
        summarizeDurations(values),
      ]),
    );
    delete indexed.metricValues;
  }
  return {
    records,
    sha256: hash.digest("hex"),
    malformed,
    malformedCount,
    byRun,
    contributors: rankVeloContributors(contributorTotals),
  };
}

function indexLine(
  line,
  lineNumber,
  scenarioById,
  byRun,
  malformed,
  controlSecret,
  contributorTotals,
  markMalformed,
) {
  let sample;
  try {
    sample = JSON.parse(line);
  } catch {
    addMalformed(`line ${lineNumber}: invalid JSON`, malformed, markMalformed);
    return;
  }
  if (!sample?.runId || !sample?.scenario) {
    addMalformed(`line ${lineNumber}: missing runId or scenario`, malformed, markMalformed);
    return;
  }
  const scenario = scenarioById.get(sample.scenario);
  if (!scenario) {
    addMalformed(
      `line ${lineNumber}: unknown scenario ${sample.scenario}`,
      malformed,
      markMalformed,
    );
    return;
  }
  const current = byRun[sample.runId] ?? {
    attempted: 0,
    successful: 0,
    correlatedSuccessful: 0,
    coldResetVerified: 0,
    metricValues: {},
    scenario: sample.scenario,
  };
  if (current.scenario !== sample.scenario) {
    addMalformed(`line ${lineNumber}: runId spans multiple scenarios`, malformed, markMalformed);
    return;
  }
  current.attempted += 1;
  if (sample.status === "success") {
    current.successful += 1;
    if (sample.correlationId) current.correlatedSuccessful += 1;
    const errors = validateLifecycleSample(sample, scenario, sample.clockProvenance);
    for (const error of errors) {
      addMalformed(`line ${lineNumber}: ${error}`, malformed, markMalformed);
    }
    if (sample.temperature === "cold") {
      const coldErrors = validateColdResetEvidence(sample, { secret: controlSecret });
      if (coldErrors.length === 0) current.coldResetVerified += 1;
      for (const error of coldErrors)
        addMalformed(`line ${lineNumber}: ${error}`, malformed, markMalformed);
    }
    if (scenario.adapter === "http") {
      for (const error of validateRecordedHttpOutcome(sample.outcome, scenario.outcome))
        addMalformed(`line ${lineNumber}: ${error}`, malformed, markMalformed);
    }
    for (const metricName of scenario.requiredMetrics) {
      const metric = (Array.isArray(sample.metrics) ? sample.metrics : []).find(
        (entry) => entry.name === metricName,
      );
      if (!metric) continue;
      const values = current.metricValues[metricName] ?? [];
      values.push(metric.durationMs);
      current.metricValues[metricName] = values;
    }
    for (const timing of Array.isArray(sample.dependencyTimings) ? sample.dependencyTimings : []) {
      const timingErrors = validateDependencyTiming(timing);
      for (const error of timingErrors)
        addMalformed(`line ${lineNumber}: ${error}`, malformed, markMalformed);
      if (timingErrors.length === 0 && timing.controlledBy === "Velo")
        accumulateVeloContributor(contributorTotals, timing);
    }
  }
  byRun[sample.runId] = current;
}

export function deriveVeloContributors(samples) {
  const totals = new Map();
  for (const sample of samples) {
    if (sample.status !== "success") continue;
    for (const timing of Array.isArray(sample.dependencyTimings) ? sample.dependencyTimings : []) {
      if (validateDependencyTiming(timing).length === 0 && timing.controlledBy === "Velo")
        accumulateVeloContributor(totals, timing);
    }
  }
  return rankVeloContributors(totals);
}

function validateDependencyTiming(timing) {
  const errors = [];
  if (!timing?.name || typeof timing.name !== "string")
    errors.push("dependency timing name is required");
  if (!Number.isFinite(timing?.durationMs) || timing.durationMs < 0)
    errors.push("dependency timing durationMs must be non-negative");
  if (typeof timing?.controlledBy !== "string")
    errors.push("dependency timing controlledBy is required");
  return errors;
}

function accumulateVeloContributor(totals, timing) {
  const current = totals.get(timing.name) ?? { impactMs: 0, sampleCount: 0 };
  current.impactMs += timing.durationMs;
  current.sampleCount += 1;
  totals.set(timing.name, current);
}

function rankVeloContributors(totals) {
  return [...totals.entries()]
    .map(([name, value]) => ({
      name,
      controlledBy: "Velo",
      impactMs: Math.round(value.impactMs * 100) / 100,
      sampleCount: value.sampleCount,
    }))
    .sort((left, right) => right.impactMs - left.impactMs || left.name.localeCompare(right.name))
    .slice(0, 3)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

function validateRun(run, scenario, manifest, report, label, failures) {
  const requiredStrings = [
    "runId",
    "captureId",
    "cohortId",
    "scenario",
    "profile",
    "temperature",
    "window",
    "revision",
    "region",
    "runtime",
    "network",
    "dependencyVersions",
    "dependencyEndpoints",
    "payloadIdentity",
    "datasetIdentity",
  ];
  for (const key of requiredStrings) {
    if (!run[key] || run[key] === "unresolved")
      failures.push(`${label}: ${key} is required and resolved`);
  }
  if (!validIso(run.capturedAt)) failures.push(`${label}: capturedAt must be an ISO timestamp`);
  if (run.status !== "captured") failures.push(`${label}: status must be captured`);
  if (run.cohortId !== report?.cohortId || run.revision !== report?.revision) {
    failures.push(`${label}: run cohort/revision differs from the frozen qualification cohort`);
  }
  if (run.evidenceMode !== "real") failures.push(`${label}: evidenceMode must be real`);
  if (run.mode !== "capture") failures.push(`${label}: mode must be capture`);
  if (run.manifestVersion !== manifest.version)
    failures.push(`${label}: manifestVersion is invalid`);
  if (run.evidenceSchemaVersion !== manifest.evidenceSchemaVersion) {
    failures.push(`${label}: evidenceSchemaVersion is invalid`);
  }
  if (!scenario) {
    failures.push(`${label}: unknown scenario ${run.scenario}`);
    return;
  }
  if (run.adapter !== scenario.adapter)
    failures.push(`${label}: adapter does not match scenario contract`);
  if (
    run.fixtureControl?.authorized !== true ||
    run.fixtureControl?.cohortId !== run.cohortId ||
    !run.fixtureControl?.setupReceiptId ||
    run.fixtureControl?.cleanup?.controlled !== true ||
    run.fixtureControl?.cleanup?.cohortId !== run.cohortId ||
    !run.fixtureControl?.cleanup?.receiptId
  ) {
    failures.push(`${label}: authorized cohort fixture setup/cleanup evidence is required`);
  }
  if (run.temperature === "cold") {
    if (
      run.coldReset?.required !== true ||
      run.coldReset?.verifiedSamples !== run.successfulSamples ||
      !Array.isArray(run.coldReset?.methods) ||
      run.coldReset.methods.length === 0
    ) {
      failures.push(`${label}: every successful cold sample requires verified reset evidence`);
    }
  } else if (run.coldReset?.required !== false) {
    failures.push(`${label}: warm run coldReset metadata is invalid`);
  }
  if (run.scenarioVersion !== scenario.version)
    failures.push(`${label}: scenarioVersion is invalid`);
  const clockErrors = validateClockProvenance(run.clockProvenance);
  for (const error of clockErrors) failures.push(`${label}: ${error}`);
  if (!Number.isInteger(run.attemptedSamples) || run.attemptedSamples < 1) {
    failures.push(`${label}: attemptedSamples must be positive`);
  }
  if (
    !Number.isInteger(run.successfulSamples) ||
    run.successfulSamples < manifest.thresholds.requiredSuccessfulSamples
  ) {
    failures.push(
      `${label}: requires ${manifest.thresholds.requiredSuccessfulSamples} successful samples`,
    );
  }
  if (
    run.errorSamples !==
    run.attemptedSamples - run.successfulSamples - (run.droppedSamples ?? 0)
  ) {
    failures.push(`${label}: sample counters do not reconcile`);
  }
  if ((run.droppedSamples ?? 0) !== 0 || (run.saturation?.droppedArrivals ?? 0) !== 0) {
    failures.push(`${label}: qualification contains dropped arrivals`);
  }
  if ((run.saturation?.saturatedArrivals ?? 0) > manifest.thresholds.maxSaturatedArrivals) {
    failures.push(`${label}: benchmark client saturated`);
  }
  if (
    run.workload?.attemptedSamples !== run.attemptedSamples ||
    run.workload?.successfulSamples !== run.successfulSamples
  ) {
    failures.push(`${label}: workload counters do not reconcile`);
  }
  const target = run.profile === "growth" ? 50 : 10;
  const concurrency = run.profile === "growth" ? 100 : 25;
  if (
    run.workload?.targetRequestsPerSecond !== target ||
    run.pacing?.targetRequestsPerSecond !== target
  ) {
    failures.push(`${label}: profile arrival rate was not enforced`);
  }
  if (run.workload?.concurrency !== concurrency)
    failures.push(`${label}: profile concurrency was not enforced`);
  if ((run.pacing?.achievedRequestsPerSecond ?? 0) < target)
    failures.push(`${label}: arrival rate was not sustained`);
  if ((run.throughput?.successfulPerSecond ?? 0) < target)
    failures.push(`${label}: successful throughput is below target`);
  const errorRate = run.attemptedSamples > 0 ? run.errorSamples / run.attemptedSamples : 1;
  if (errorRate >= manifest.thresholds.maxErrorRateExclusive)
    failures.push(`${label}: error budget failed`);
  const taxonomyTotal = Object.values(run.errorTaxonomy ?? {}).reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
  if (taxonomyTotal !== run.errorSamples + (run.droppedSamples ?? 0)) {
    failures.push(`${label}: error taxonomy does not reconcile`);
  }
  if (run.http503?.count !== (run.errorTaxonomy?.http_5xx_503 ?? 0)) {
    failures.push(`${label}: HTTP 503 accounting does not reconcile`);
  }
  if ((run.http503?.unattributedCount ?? 0) > 0)
    failures.push(`${label}: unexplained HTTP 503 responses`);
  const primary = validateDistribution(run.latencyMs, label, scenario.primaryMetric, failures);
  const slo = manifest.thresholds.latencySloMs[scenario.id];
  if (!slo) failures.push(`${label}: locked SLO is missing`);
  else if (primary) {
    for (const percentile of ["p50", "p95", "p99"]) {
      if (run.latencyMs[percentile] > slo[percentile]) {
        failures.push(`${label}: ${percentile} exceeds locked ${scenario.id} SLO`);
      }
    }
    const baselineP95 = report?.baseline?.scenarios?.[scenario.id]?.p95;
    if (
      Number.isFinite(baselineP95) &&
      run.latencyMs.p95 > baselineP95 * (1 + manifest.thresholds.maxP95Regression)
    ) {
      failures.push(`${label}: p95 regression exceeds the locked baseline-relative gate`);
    }
  }
  for (const metric of scenario.requiredMetrics) {
    const distribution = run.lifecycleMetrics?.[metric];
    if (validateDistribution(distribution, label, metric, failures)) {
      if (distribution.count !== run.successfulSamples) {
        failures.push(`${label}: ${metric} does not cover every successful sample`);
      }
    }
  }
  const primaryLifecycle = run.lifecycleMetrics?.[scenario.primaryMetric];
  if (primaryLifecycle && JSON.stringify(primaryLifecycle) !== JSON.stringify(run.latencyMs)) {
    failures.push(`${label}: latencyMs does not match the primary lifecycle metric`);
  }
}

function validateArtifact(artifact, index, runs, totalAttempted, failures) {
  if (artifact?.format !== "ndjson") failures.push("sample artifact format must be ndjson");
  if (!artifact?.path) failures.push("sample artifact path is required");
  if (!/^[a-f0-9]{64}$/.test(artifact?.sha256 ?? ""))
    failures.push("sample artifact sha256 is invalid");
  if (!Number.isInteger(artifact?.records) || artifact.records !== totalAttempted) {
    failures.push("sample artifact record count must equal attempted samples");
  }
  if (!index) {
    failures.push("raw NDJSON sample artifact was not verified");
    return;
  }
  if (index.records !== artifact.records)
    failures.push("raw NDJSON record count does not match report");
  if (index.sha256 !== artifact.sha256) failures.push("raw NDJSON sha256 does not match report");
  if ((index.malformedCount ?? index.malformed?.length ?? 0) > 0) {
    failures.push(
      `raw NDJSON contains malformed lifecycle evidence: ${(index.malformed ?? []).join("; ")}`,
    );
  }
  const expectedRunIds = new Set(runs.map((run) => run.runId));
  for (const run of runs) {
    const raw = index.byRun?.[run.runId];
    if (!raw) {
      failures.push(`${run.runId}: raw NDJSON samples are missing`);
      continue;
    }
    if (raw.attempted !== run.attemptedSamples || raw.successful !== run.successfulSamples) {
      failures.push(`${run.runId}: raw NDJSON counters do not match summary`);
    }
    if (Number.isFinite(raw.correlatedSuccessful)) {
      const coverage = raw.successful > 0 ? raw.correlatedSuccessful / raw.successful : 0;
      if (coverage < 0.999) failures.push(`${run.runId}: correlation coverage is below 99.9%`);
    }
    for (const metric of Object.keys(run.lifecycleMetrics ?? {})) {
      if (!distributionsEqual(raw.lifecycleMetrics?.[metric], run.lifecycleMetrics[metric])) {
        failures.push(`${run.runId}: ${metric} summary differs from raw NDJSON distribution`);
      }
    }
    if (run.temperature === "cold" && raw.coldResetVerified !== run.successfulSamples) {
      failures.push(`${run.runId}: raw NDJSON cold reset evidence is incomplete`);
    }
  }
  for (const runId of Object.keys(index.byRun ?? {})) {
    if (!expectedRunIds.has(runId)) failures.push(`${runId}: raw NDJSON has no summary run`);
  }
}

function validateBaseline(baseline, manifest, failures) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    failures.push("approved baseline is required");
    return;
  }
  for (const key of ["id", "revision", "capturedAt", "artifact", "sha256"]) {
    if (!baseline[key]) failures.push(`baseline.${key} is required`);
  }
  if (baseline.capturedAt && !validIso(baseline.capturedAt))
    failures.push("baseline.capturedAt is invalid");
  if (baseline.sha256 && !/^[a-f0-9]{64}$/.test(baseline.sha256))
    failures.push("baseline.sha256 is invalid");
  for (const scenario of manifest.scenarios) {
    const value = baseline.scenarios?.[scenario];
    if (!Number.isFinite(value?.p95) || value.p95 < 0) {
      failures.push(`baseline.scenarios.${scenario}.p95 is required`);
    }
  }
}

function validateBaselineEvidence(baseline, index, manifest, failures) {
  if (!index) {
    failures.push("baseline artifact was not independently verified");
    return;
  }
  if (index.sha256 !== baseline?.sha256) failures.push("baseline artifact sha256 does not match");
  if (index.value?.revision !== baseline?.revision)
    failures.push("baseline artifact revision does not match");
  if (index.value?.capturedAt !== baseline?.capturedAt)
    failures.push("baseline artifact capturedAt does not match");
  for (const scenario of manifest.scenarios) {
    if (index.value?.scenarios?.[scenario]?.p95 !== baseline?.scenarios?.[scenario]?.p95) {
      failures.push(`baseline artifact ${scenario} p95 does not match`);
    }
  }
}

function validateContributors(contributors, rawContributors, manifest, failures) {
  if (
    !Array.isArray(contributors) ||
    contributors.length !== manifest.thresholds.minimumContributors
  ) {
    failures.push("exactly three raw-derived Velo-controlled contributors are required");
    return;
  }
  if (!Array.isArray(rawContributors) || rawContributors.length < 3) {
    failures.push("raw samples contain fewer than three Velo-controlled contributors");
    return;
  }
  for (const [index, contributor] of contributors.entries()) {
    if (contributor?.rank !== index + 1) failures.push(`contributor rank ${index + 1} is required`);
    if (!contributor?.name) failures.push(`contributor ${index + 1}.name is required`);
    if (contributor?.controlledBy !== "Velo")
      failures.push(`contributor ${index + 1} must be Velo-controlled`);
    if (!Number.isFinite(contributor?.impactMs) || contributor.impactMs < 0) {
      failures.push(`contributor ${index + 1}.impactMs is required`);
    }
    if (!Number.isInteger(contributor?.sampleCount) || contributor.sampleCount < 1)
      failures.push(`contributor ${index + 1}.sampleCount is required`);
    if (!contributorsEqual(contributor, rawContributors[index]))
      failures.push(`contributor rank ${index + 1} differs from raw dependency timings`);
  }
}

function contributorsEqual(left, right) {
  return ["rank", "name", "controlledBy", "impactMs", "sampleCount"].every(
    (field) => left?.[field] === right?.[field],
  );
}

function validateDistribution(value, label, name, failures) {
  if (!value || value.unit !== "ms") {
    failures.push(`${label}: ${name} distribution with ms unit is required`);
    return false;
  }
  for (const field of ["p50", "p95", "p99", "max", "count"]) {
    if (!Number.isFinite(value[field]) || value[field] < 0) {
      failures.push(`${label}: ${name}.${field} must be non-negative`);
      return false;
    }
  }
  if (!(value.p50 <= value.p95 && value.p95 <= value.p99 && value.p99 <= value.max)) {
    failures.push(`${label}: ${name} percentiles are not ordered`);
    return false;
  }
  return true;
}

function validateWindowIdentity(runs, failures) {
  const identities = new Map();
  for (const run of runs) {
    const group = `${run.scenario}/${run.profile}/${run.temperature}`;
    const values = identities.get(group) ?? new Set();
    const identity = `${run.captureId}/${run.capturedAt}`;
    if (values.has(identity)) failures.push(`${group}: window captures are not distinct`);
    values.add(identity);
    identities.set(group, values);
  }
}

function distributionsEqual(raw, summary) {
  return ["unit", "count", "p50", "p95", "p99", "max"].every(
    (field) => raw?.[field] === summary?.[field],
  );
}

function validateRecordedHttpOutcome(value, outcome) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value))
    return ["recorded HTTP outcome must be an object"];
  for (const [key, expectation] of Object.entries(outcome?.required ?? {})) {
    const actual = value[key];
    const valid =
      expectation === "string"
        ? typeof actual === "string" && actual.length > 0
        : expectation === "array"
          ? Array.isArray(actual)
          : expectation === "boolean"
            ? typeof actual === "boolean"
            : expectation === "string|null"
              ? actual === null || typeof actual === "string"
              : actual === expectation;
    if (!valid) errors.push(`recorded HTTP outcome ${key} must match ${expectation}`);
  }
  return errors;
}

function validateSourceCaptures(sourceCaptures, runs, report, manifest, failures) {
  if (!Array.isArray(sourceCaptures) || sourceCaptures.length !== manifest.windows.length) {
    failures.push("exactly three immutable source window captures are required");
    return;
  }
  const windows = new Set();
  const captureIds = new Set();
  for (const source of sourceCaptures) {
    if (!manifest.windows.includes(source?.window) || windows.has(source.window)) {
      failures.push("source capture windows must be unique and manifest-defined");
    }
    windows.add(source?.window);
    if (!source?.captureId || captureIds.has(source.captureId)) {
      failures.push("source capture IDs must be present and unique");
    }
    captureIds.add(source?.captureId);
    if (!validIso(source?.startedAt) || !validIso(source?.completedAt))
      failures.push("source capture boundary timestamps are invalid");
    else {
      const boundary = manifest.windowPolicy?.definitions?.[source.window];
      for (const [name, value] of [
        ["startedAt", source.startedAt],
        ["completedAt", source.completedAt],
      ]) {
        const hour = new Date(value).getUTCHours();
        if (!boundary || hour < boundary.startHour || hour >= boundary.endHour) {
          failures.push(`${source.window} source ${name} is outside its declared UTC window`);
        }
      }
      if (Date.parse(source.completedAt) < Date.parse(source.startedAt))
        failures.push(`${source.window} source capture boundaries are reversed`);
    }
    if (!/^[a-f0-9]{64}$/.test(source?.reportSha256 ?? "")) {
      failures.push("source capture reportSha256 is invalid");
    }
    if (source?.cohortId !== report?.cohortId || source?.revision !== report?.revision) {
      failures.push("source capture cohort/revision differs from the frozen qualification cohort");
    }
  }
  const ordered = manifest.windows
    .map((window) => sourceCaptures.find((source) => source.window === window))
    .filter(Boolean);
  for (let index = 1; index < ordered.length; index += 1) {
    const separationMinutes =
      (Date.parse(ordered[index].startedAt) - Date.parse(ordered[index - 1].completedAt)) / 60_000;
    if (
      !Number.isFinite(separationMinutes) ||
      separationMinutes < manifest.windowPolicy.minimumSeparationMinutes
    ) {
      failures.push(
        `source capture windows must be chronologically separated by at least ${manifest.windowPolicy.minimumSeparationMinutes} minutes`,
      );
    }
  }
  for (const run of runs) {
    const source = sourceCaptures.find((entry) => entry.window === run.window);
    if (source && source.captureId !== run.captureId) {
      failures.push(`${run.runId}: captureId does not match its immutable source window`);
    }
    if (
      source &&
      validIso(run.capturedAt) &&
      (Date.parse(run.capturedAt) < Date.parse(source.startedAt) ||
        Date.parse(run.capturedAt) > Date.parse(source.completedAt))
    ) {
      failures.push(`${run.runId}: run timestamp is outside its source capture boundaries`);
    }
  }
}

function addMalformed(message, malformed, markMalformed) {
  markMalformed();
  if (malformed.length < 20) malformed.push(message);
}

function cellKey(cell) {
  return `${cell.scenario}/${cell.profile}/${cell.temperature}/${cell.window}`;
}

function validIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
