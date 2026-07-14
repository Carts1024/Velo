import { loadSprint11Contract } from "./sprint11-contract.mjs";

const PENDING = "EVIDENCE_PENDING";

export function pairMatchedCohorts(runs = []) {
  const pairs = new Map();
  for (const run of runs) {
    const key = [run.scenario ?? "", run.arm, run.profile ?? run.arm, run.window, run.temperature ?? "", run.rateRps ?? run.throughputRps ?? ""].join("/");
    const pair = pairs.get(key) ?? {};
    pair[run.subject] = run;
    pairs.set(key, pair);
  }
  return [...pairs.entries()].map(([key, pair]) => ({ key, baseline: pair.baseline, candidate: pair.candidate, matched: Boolean(pair.baseline && pair.candidate) }));
}

export function maximumSustainableThroughput(runs = [], manifest) {
  const passing = runs.filter((run) => run.pass === true || run.gates?.pass === true).map((run) => Number(run.throughputRps ?? run.rateRps ?? run.throughput?.successfulPerSecond)).filter(Number.isFinite).sort((a, b) => a - b);
  const result = { sustainableRps: passing.length ? passing.at(-1) : null, testedRps: passing, refinement: "staircase+bounded-refinement" };
  if (result.sustainableRps !== null) result.headroom = Number((result.sustainableRps / Math.max(manifest?.workload?.normalRequestsPerSecond ?? 1, 1) - 1).toFixed(4));
  return result;
}

export function minimumWindowSustainableThroughput(runs = [], manifest) {
  const byWindow = Object.fromEntries((manifest?.windows ?? []).map((window) => [window, maximumSustainableThroughput(runs.filter((run) => run.window === window), manifest)]));
  const values = Object.values(byWindow).map((value) => value.sustainableRps);
  return {
    byWindow,
    sustainableRps: values.every(Number.isFinite) ? Math.min(...values) : null,
  };
}

/** Return the deterministic staircase/refinement points an operator must test. */
export function capacitySearchPoints({ minRps, maxRps, stepRps, resolutionRps } = {}) {
  if (![minRps, maxRps, stepRps, resolutionRps].every((value) => Number.isFinite(value) && value > 0) || minRps > maxRps) return [];
  const points = [];
  for (let value = minRps; value <= maxRps + Number.EPSILON; value += stepRps) points.push(Number(value.toFixed(6)));
  const last = points.at(-1);
  if (last !== maxRps) points.push(maxRps);
  return points;
}

export function refineCapacityRange({ lower, upper, resolutionRps, isPassing = () => true } = {}) {
  if (![lower, upper, resolutionRps].every((value) => Number.isFinite(value)) || lower > upper || resolutionRps <= 0) return [];
  const points = [];
  let left = lower;
  let right = upper;
  while (right - left > resolutionRps) {
    const midpoint = Number(((left + right) / 2).toFixed(6));
    points.push(midpoint);
    // The operator supplies pass/fail for each midpoint; this helper never
    // invents evidence when no callback is supplied.
    if (isPassing(midpoint)) left = midpoint; else right = midpoint;
    if (midpoint === right) break;
  }
  return points;
}

export async function evaluateSprint11(report, { manifest, contract, requireApprovals = false } = {}) {
  contract ??= manifest ? { manifest } : await loadSprint11Contract();
  manifest ??= contract.manifest;
  const failures = [];
  const pending = [];
  const runs = Array.isArray(report?.runs) ? report.runs : [];
  if (!report || !runs.length) pending.push("qualification evidence runs are missing");
  if (report?.manifestVersion !== 4) pending.push("report manifestVersion must be 4");
  if (report?.evidenceSchemaVersion !== 3) pending.push("report evidenceSchemaVersion must be 3");
  if (report?.manifestDigest && manifest.manifestDigest && report.manifestDigest !== manifest.manifestDigest) failures.push("report manifest digest does not match frozen manifest");
  if (!report?.cohortId) pending.push("qualification cohort is missing");
  const subjects = new Set(runs.map((run) => run.subject));
  if (!subjects.has("baseline")) pending.push("baseline captures are missing");
  if (!subjects.has("candidate")) pending.push("candidate captures are missing");
  const keys = new Map();
  for (const run of runs) {
    const label = `run ${run.runId ?? "unknown"}`;
    if (!run.runId || !run.subject || !run.arm || !run.window || !run.scenario) { pending.push(`${label}: required identity metadata is missing`); continue; }
    const key = `${run.subject}/${run.scenario}/${run.arm}/${run.profile ?? run.arm}/${run.temperature ?? ""}/${run.window}/${run.rateRps ?? run.throughputRps ?? ""}`;
    if (keys.has(key)) failures.push(`${label}: duplicate run identity ${key}`); else keys.set(key, run);
    if (report.cohortId && run.cohortId !== report.cohortId) failures.push(`${label}: cohort does not match report`);
    if (run.status && run.status !== "captured") failures.push(`${label}: status is not captured`);
    if (run.errorRate !== undefined && Number(run.errorRate) >= manifest.slo.maxErrorRateExclusive) failures.push(`${label}: error rate exceeds locked threshold`);
    if (run.latencyMs) {
      for (const percentile of ["p50", "p95", "p99"]) if (!Number.isFinite(run.latencyMs[percentile])) pending.push(`${label}: ${percentile} latency is missing`);
    } else pending.push(`${label}: latency distribution is missing`);
    if (run.correlationCoverage !== undefined && run.correlationCoverage < manifest.telemetry.correlationCoverageAtLeast) failures.push(`${label}: correlation coverage below 99.9%`);
    else if (run.correlationCoverage === undefined) pending.push(`${label}: correlation coverage is missing`);
    if (run.telemetry === undefined) pending.push(`${label}: telemetry state is missing`);
    if (!run.rawArtifact?.sha256) pending.push(`${label}: raw artifact digest is missing`);
    if (run.temperature === "cold" && run.resetAttestation !== true) pending.push(`${label}: cold reset attestation is missing`);
    if (Number.isInteger(run.successfulSamples) && run.successfulSamples < manifest.requiredEvidence.minimumSuccessfulSamplesPerCell && ["normal", "growth"].includes(run.profile ?? run.arm)) failures.push(`${label}: insufficient successful samples`);
    if (run.duplicateEffects !== undefined && run.duplicateEffects !== 0) failures.push(`${label}: duplicate financial/webhook side effects detected`);
    if (run.unboundedExternalCalls === true) failures.push(`${label}: unbounded external calls detected`);
    if (run.unresolvedOperationsWithoutOwner === true) failures.push(`${label}: unresolved operation lacks durable owner`);
    if (run.unexplainedP99 === true) failures.push(`${label}: unexplained p99 finding remains`);
  }
  for (const pair of pairMatchedCohorts(runs)) if (!pair.matched && ["normal", "growth"].some((arm) => pair.key.includes(`/${arm}/`))) pending.push(`unmatched baseline/candidate cohort ${pair.key}`);
  for (const scenario of manifest.scenarios)
    for (const arm of ["normal", "growth"])
      for (const temperature of manifest.temperatures)
        for (const window of manifest.windows)
          for (const subject of ["baseline", "candidate"]) {
            const key = `${subject}/${scenario}/${arm}/${arm}/${temperature}/${window}`;
            if (![...keys.keys()].some((runKey) => runKey === key || runKey.startsWith(`${key}/`)))
              pending.push(`missing required qualification cell ${key}`);
          }
  const candidateRuns = runs.filter((run) => run.subject === "candidate");
  const computedCapacity = minimumWindowSustainableThroughput(candidateRuns, manifest);
  const capacity = report?.capacity ?? computedCapacity;
  if (report?.capacity && !report.capacity.byWindow) pending.push("capacity evidence must identify every required window");
  if (capacity.byWindow && Object.values(capacity.byWindow).some((window) => !Number.isFinite(window?.sustainableRps))) pending.push("capacity evidence is missing one or more required windows");
  if (capacity.sustainableRps === null) pending.push("capacity evidence is missing");
  for (const target of ["normalRequestsPerSecond", "growthRequestsPerSecond"]) if (Number.isFinite(manifest.workload[target]) && Number.isFinite(capacity.sustainableRps) && capacity.sustainableRps < manifest.workload[target] * (1 + manifest.slo.headroomFraction)) failures.push(`sustainable throughput lacks ${Math.round(manifest.slo.headroomFraction * 100)}% headroom over ${target}`);
  if (manifest.requiredEvidence.requireSprint10Observability && report?.observability?.status !== "pass") pending.push("Sprint 10 observability evidence is missing");
  if (manifest.requiredEvidence.requireP01AndP05 && report?.acceptance?.p01 !== "pass") pending.push("P0.1/P0.5 acceptance evidence is missing");
  const approvals = Array.isArray(report?.approvals) ? report.approvals : [];
  const hasApprovals = approvals.some((approval) => approval.role === "Product" && approval.status === "APPROVED" && approval.evidenceDigest === report?.evidenceDigest) && approvals.some((approval) => approval.role === "Architecture" && approval.status === "APPROVED" && approval.evidenceDigest === report?.evidenceDigest);
  const approvalStatus = hasApprovals ? "APPROVED" : approvals.some((approval) => approval.status === "REJECTED") ? "REJECTED" : "PENDING";
  if (requireApprovals && !hasApprovals) pending.push("Product and Architecture approvals are required");
  const machineVerdict = failures.length ? "FAIL" : pending.length ? PENDING : "PASS";
  return { machineVerdict, approvalStatus, failures, pending, capacity, matchedPairs: pairMatchedCohorts(runs), publicClaim: machineVerdict === "PASS" && approvalStatus === "APPROVED" ? buildPublicClaim(report) : null };
}

export function buildPublicClaim(report) {
  const candidate = report?.candidate ?? {};
  return `Velo Sprint 11 qualification: revision ${candidate.revision ?? "unknown"}; environment ${candidate.environment ?? "matched qualification environment"}; comparative claims limited to the recorded journeys, windows, profiles, throughput, successful sample counts, and confirmation definition.`;
}

export function validateCompetitorAdapter(adapter) {
  if (adapter == null) return [];
  const errors = [];
  for (const key of ["name", "authorization", "confirmationDefinition", "matchedConditions", "featureDifferences", "uncertainty"]) if (!adapter[key]) errors.push(`competitor adapter ${key} is required`);
  return errors;
}
