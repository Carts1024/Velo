import { loadBenchmarkContract, normalizeRuns, validateCapturedReport } from "./benchmark-contract.mjs";

export async function evaluateReport(report, { contract, rejectOverrides = false } = {}) {
  contract ??= await loadBenchmarkContract();
  const failures = [];
  if (rejectOverrides) failures.push("release thresholds are locked in benchmarks/manifest.json; CLI threshold overrides are not permitted");
  const { manifest } = contract;
  failures.push(...validateCapturedReport(report, contract));
  const runs = normalizeRuns(report);
  const windows = new Set();
  const runIds = new Set();
  if (runs.length < manifest.thresholds.requiredRuns) failures.push(`requires ${manifest.thresholds.requiredRuns} complete benchmark runs; found ${runs.length}`);
  if (manifest.thresholds.requireBaseline && !report.baseline) failures.push("baseline comparison is required");
  for (const run of runs) {
    const label = `${run.runId ?? "unknown"}/${run.scenario ?? "unknown"}`;
    if (runIds.has(run.runId)) failures.push(`${label}: duplicate runId`);
    runIds.add(run.runId);
    if (windows.has(run.window)) failures.push(`${label}: duplicate window ${run.window}`);
    windows.add(run.window);
    const errorRate = run.attemptedSamples > 0 ? run.errorSamples / run.attemptedSamples : 1;
    if (run.successfulSamples < manifest.thresholds.requiredSuccessfulSamples) failures.push(`${label}: requires ${manifest.thresholds.requiredSuccessfulSamples} successful samples; found ${run.successfulSamples}`);
    if (errorRate > manifest.thresholds.maxErrorRate) failures.push(`${label}: error rate ${(errorRate * 100).toFixed(2)}% exceeds ${(manifest.thresholds.maxErrorRate * 100).toFixed(2)}%`);
    const minimumThroughput = manifest.thresholds.minSuccessfulThroughput?.[run.profile];
    if (Number.isFinite(minimumThroughput) && run.throughput?.successfulPerSecond < minimumThroughput) failures.push(`${label}: successful throughput ${run.throughput.successfulPerSecond} is below ${minimumThroughput}/s`);
    if (run.profile === "growth" && run.p99CliffExplained !== true) failures.push(`${label}: growth-load p99 cliff is not explicitly explained`);
    if ((run.http503?.unattributedCount ?? 0) > 0) failures.push(`${label}: contains unexplained 503 responses`);
  }
  for (const window of manifest.windows) if (!windows.has(window)) failures.push(`missing required window ${window}`);
  if (report.baseline) for (const run of runs) {
    const before = report.baseline[run.scenario]?.latencyMs?.p95;
    if (Number.isFinite(before) && run.latencyMs?.p95 > before * (1 + manifest.thresholds.maxP95Regression)) failures.push(`${run.runId}/${run.scenario}: p95 regression exceeds ${(manifest.thresholds.maxP95Regression * 100).toFixed(0)}%`);
  }
  return { status: failures.length === 0 ? "pass" : "fail", failures };
}
