import { loadBenchmarkContract, normalizeRuns, validateCapturedReport } from "./benchmark-contract.mjs";

export async function evaluateReport(report, { contract, rejectOverrides = false } = {}) {
  contract ??= await loadBenchmarkContract();
  const failures = [];
  if (rejectOverrides) failures.push("release thresholds are locked in benchmarks/manifest.json; CLI threshold overrides are not permitted");
  const { manifest } = contract;
  failures.push(...validateCapturedReport(report, contract));
  const runs = normalizeRuns(report);
  const windowsByGroup = new Map();
  const runIds = new Set();
  if (runs.length < manifest.thresholds.requiredRuns) failures.push(`requires ${manifest.thresholds.requiredRuns} complete benchmark runs; found ${runs.length}`);
  if (manifest.thresholds.requireBaseline && !report.baseline) failures.push("baseline comparison is required");
  for (const run of runs) {
    const label = `${run.runId ?? "unknown"}/${run.scenario ?? "unknown"}`;
    if (runIds.has(run.runId)) failures.push(`${label}: duplicate runId`);
    runIds.add(run.runId);
    const group = `${run.scenario}/${run.profile}/${run.temperature}`;
    const windows = windowsByGroup.get(group) ?? new Set();
    if (windows.has(run.window)) failures.push(`${label}: duplicate window ${run.window} for ${group}`);
    windows.add(run.window);
    windowsByGroup.set(group, windows);
    const errorRate = run.attemptedSamples > 0 ? run.errorSamples / run.attemptedSamples : 1;
    if (run.successfulSamples < manifest.thresholds.requiredSuccessfulSamples) failures.push(`${label}: requires ${manifest.thresholds.requiredSuccessfulSamples} successful samples; found ${run.successfulSamples}`);
    if (errorRate >= manifest.thresholds.maxErrorRateExclusive) failures.push(`${label}: error rate ${(errorRate * 100).toFixed(2)}% must remain below ${(manifest.thresholds.maxErrorRateExclusive * 100).toFixed(2)}%`);
    const minimumThroughput = manifest.thresholds.minSuccessfulThroughput?.[run.profile];
    if (Number.isFinite(minimumThroughput) && run.throughput?.successfulPerSecond < minimumThroughput) failures.push(`${label}: successful throughput ${run.throughput.successfulPerSecond} is below ${minimumThroughput}/s`);
    if ((run.saturation?.saturatedArrivals ?? 0) > manifest.thresholds.maxSaturatedArrivals) failures.push(`${label}: benchmark client saturated ${run.saturation.saturatedArrivals} arrivals`);
    const slo = manifest.thresholds.latencySloMs?.[run.scenario];
    if (slo) for (const percentile of ["p50", "p95", "p99"]) if (run.latencyMs?.[percentile] > slo[percentile]) failures.push(`${label}: ${percentile} ${run.latencyMs[percentile]}ms exceeds locked ${slo[percentile]}ms`);
    if (run.profile === "growth" && run.p99CliffExplained !== true) failures.push(`${label}: growth-load p99 cliff is not explicitly explained`);
    if ((run.http503?.unattributedCount ?? 0) > 0) failures.push(`${label}: contains unexplained 503 responses`);
  }
  const scenarios = new Set(runs.map((run) => run.scenario));
  for (const scenario of scenarios) {
    for (const profile of manifest.qualificationProfiles) {
      for (const temperature of manifest.temperatures) {
        const group = `${scenario}/${profile}/${temperature}`;
        const windows = windowsByGroup.get(group) ?? new Set();
        for (const window of manifest.windows) {
          if (!windows.has(window)) failures.push(`${group}: missing required window ${window}`);
        }
      }
    }
  }
  if (report.baseline) for (const run of runs) {
    const before = report.baseline[run.scenario]?.latencyMs?.p95;
    if (Number.isFinite(before) && run.latencyMs?.p95 > before * (1 + manifest.thresholds.maxP95Regression)) failures.push(`${run.runId}/${run.scenario}: p95 regression exceeds ${(manifest.thresholds.maxP95Regression * 100).toFixed(0)}%`);
  }
  return { status: failures.length === 0 ? "pass" : "fail", failures };
}
