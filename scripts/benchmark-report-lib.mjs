export function generateBenchmarkMarkdown(report) {
  const runs = Array.isArray(report?.runs) ? report.runs : [];
  const successful = runs.reduce((sum, run) => sum + (run.successfulSamples ?? 0), 0);
  const attempted = runs.reduce((sum, run) => sum + (run.attemptedSamples ?? 0), 0);
  const lines = [
    "# Velo P0.1 Lifecycle Benchmark",
    "",
    `- Status: ${report?.status ?? "unresolved"}`,
    `- Captured: ${report?.capturedAt ?? "unresolved"}`,
    `- Qualification cells: ${runs.length}`,
    `- Successful operations: ${successful} / ${attempted}`,
    `- Raw samples: ${report?.sampleArtifact?.path ?? "unresolved"} (${report?.sampleArtifact?.records ?? 0} records, sha256 ${report?.sampleArtifact?.sha256 ?? "unresolved"})`,
    "",
    "## Approved baseline",
    "",
    `- ID: ${report?.baseline?.id ?? "unresolved"}`,
    `- Revision: ${report?.baseline?.revision ?? "unresolved"}`,
    `- Artifact: ${report?.baseline?.artifact ?? "unresolved"}`,
    "",
    "## Three largest Velo-controlled contributors",
    "",
    "| Rank | Contributor | Total impact (ms) | Samples | Controlled by |",
    "| ---: | --- | ---: | ---: | --- |",
  ];
  for (const contributor of (report?.contributors ?? []).slice(0, 3)) {
    lines.push(
      `| ${contributor.rank} | ${cell(contributor.name)} | ${contributor.impactMs} | ${contributor.sampleCount} | ${cell(contributor.controlledBy)} |`,
    );
  }
  lines.push(
    "",
    "## Qualification cells",
    "",
    "| Scenario | Profile | State | Window | Success | Successful ops/s | p95 (ms) | p99 (ms) |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: |",
  );
  for (const run of runs) {
    lines.push(
      `| ${cell(run.scenario)} | ${cell(run.profile)} | ${cell(run.temperature)} | ${cell(run.window)} | ${run.successfulSamples}/${run.attemptedSamples} | ${run.throughput?.successfulPerSecond ?? "?"} | ${run.latencyMs?.p95 ?? "?"} | ${run.latencyMs?.p99 ?? "?"} |`,
    );
  }
  lines.push(
    "",
    "## Lifecycle clocks",
    "",
    "| Scenario | Metric | Worst p95 (ms) | Worst p99 (ms) |",
    "| --- | --- | ---: | ---: |",
  );
  for (const entry of aggregateLifecycle(runs)) {
    lines.push(`| ${cell(entry.scenario)} | ${cell(entry.metric)} | ${entry.p95} | ${entry.p99} |`);
  }
  return `${lines.join("\n")}\n`;
}

function aggregateLifecycle(runs) {
  const metrics = new Map();
  for (const run of runs) {
    for (const [metric, distribution] of Object.entries(run.lifecycleMetrics ?? {})) {
      const key = `${run.scenario}/${metric}`;
      const current = metrics.get(key) ?? { scenario: run.scenario, metric, p95: 0, p99: 0 };
      current.p95 = Math.max(current.p95, distribution.p95 ?? 0);
      current.p99 = Math.max(current.p99, distribution.p99 ?? 0);
      metrics.set(key, current);
    }
  }
  return [...metrics.values()].sort((left, right) =>
    `${left.scenario}/${left.metric}`.localeCompare(`${right.scenario}/${right.metric}`),
  );
}

function cell(value) {
  return String(value ?? "unresolved")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}
