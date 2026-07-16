import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export async function assembleWindowReports({ reportPaths, outputPath, samplesPath, contract }) {
  if (!Array.isArray(reportPaths) || reportPaths.length !== 3) {
    throw new Error("exactly three window reports are required");
  }
  assertOutputPaths(outputPath, samplesPath);
  const sources = [];
  for (const reportPath of reportPaths) {
    sources.push(await loadWindowSource(reportPath, contract));
  }
  validateSourceSet(sources, contract);
  await mkdir(dirname(samplesPath), { recursive: true });
  const mergedArtifact = await mergeArtifacts(sources, samplesPath);
  const contributorTotals = new Map();
  for (const source of sources) mergeContributorTotals(contributorTotals, source.contributorTotals);
  const output = {
    status: "suite_completed",
    manifestVersion: contract.manifest.version,
    evidenceSchemaVersion: contract.manifest.evidenceSchemaVersion,
    capturedAt: new Date().toISOString(),
    cohortId: sources[0].report.cohortId,
    revision: sources[0].report.revision,
    baseline: sources[0].report.baseline,
    contributors: rankContributorTotals(contributorTotals),
    sourceCaptures: sources.map((source) => ({
      window: source.window,
      captureId: source.report.captureId,
      cohortId: source.report.cohortId,
      revision: source.report.revision,
      startedAt: source.report.startedAt,
      completedAt: source.report.completedAt,
      capturedAt: source.report.completedAt,
      reportSha256: source.reportSha256,
    })),
    sampleArtifact: {
      format: "ndjson",
      path: relative(dirname(outputPath), samplesPath),
      sha256: mergedArtifact.sha256,
      records: mergedArtifact.records,
    },
    runs: sources.flatMap((source) => source.report.runs),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
  return { outputPath, samplesPath, report: output };
}

async function loadWindowSource(reportPath, contract) {
  const reportBytes = await readFile(reportPath);
  const report = JSON.parse(reportBytes.toString("utf8"));
  if (report.status !== "window_completed" || !report.captureId) {
    throw new Error(`${reportPath} is not an immutable window capture`);
  }
  if (!report.cohortId || !report.revision || report.revision === "unresolved") {
    throw new Error(`${reportPath} has unresolved frozen cohort/revision metadata`);
  }
  if (Number.isNaN(Date.parse(report.startedAt)) || Number.isNaN(Date.parse(report.completedAt))) {
    throw new Error(`${reportPath} has invalid capture boundary timestamps`);
  }
  const windows = new Set((report.runs ?? []).map((run) => run.window));
  if (windows.size !== 1 || report.runs?.length !== 28) {
    throw new Error(`${reportPath} must contain exactly one complete 28-cell window`);
  }
  const window = [...windows][0];
  validateWindowCells(report, window, contract, reportPath);
  if (
    report.runs.some(
      (run) =>
        run.captureId !== report.captureId ||
        run.cohortId !== report.cohortId ||
        run.revision !== report.revision,
    )
  ) {
    throw new Error(`${reportPath} contains mixed capture, cohort, or revision identity`);
  }
  const artifactPath = safeArtifactPath(reportPath, report.sampleArtifact?.path);
  const inspected = await inspectNdjsonArtifact(artifactPath);
  if (inspected.sha256 !== report.sampleArtifact?.sha256) {
    throw new Error(`${reportPath} raw artifact checksum does not match`);
  }
  const attempted = report.runs.reduce((sum, run) => sum + (run.attemptedSamples ?? 0), 0);
  if (inspected.records !== report.sampleArtifact.records || inspected.records !== attempted) {
    throw new Error(`${reportPath} raw artifact record count does not match its run summaries`);
  }
  return {
    reportPath,
    report,
    reportSha256: createHash("sha256").update(reportBytes).digest("hex"),
    artifactPath,
    endsWithNewline: inspected.endsWithNewline,
    contributorTotals: inspected.contributorTotals,
    window,
  };
}

function validateWindowCells(report, window, contract, reportPath) {
  if (!contract.manifest.windows.includes(window))
    throw new Error(`${reportPath} has an invalid window`);
  const expected = new Set(
    contract.manifest.scenarios.flatMap((scenario) =>
      contract.manifest.qualificationProfiles.flatMap((profile) =>
        contract.manifest.temperatures.map(
          (temperature) => `${scenario}/${profile}/${temperature}/${window}`,
        ),
      ),
    ),
  );
  const actual = new Set(
    report.runs.map((run) => `${run.scenario}/${run.profile}/${run.temperature}/${run.window}`),
  );
  if (actual.size !== expected.size || [...expected].some((cell) => !actual.has(cell))) {
    throw new Error(`${reportPath} does not contain the exact 28-cell window matrix`);
  }
}

function validateSourceSet(sources, contract) {
  if (new Set(sources.map((source) => source.window)).size !== contract.manifest.windows.length) {
    throw new Error("window reports must cover morning, afternoon, and evening exactly once");
  }
  if (new Set(sources.map((source) => source.report.captureId)).size !== sources.length) {
    throw new Error("window reports must have distinct capture IDs");
  }
  for (const field of ["revision", "cohortId", "baseline"]) {
    const expected = stableValue(sources[0].report[field]);
    if (sources.some((source) => stableValue(source.report[field]) !== expected)) {
      throw new Error(`all window reports must use the same frozen ${field}`);
    }
  }
}

function assertOutputPaths(outputPath, samplesPath) {
  if (!outputPath || !samplesPath || outputPath === samplesPath) {
    throw new Error("distinct output and samples paths are required");
  }
  const relativeSamples = relative(dirname(outputPath), samplesPath);
  if (isAbsolute(relativeSamples) || relativeSamples.startsWith("..")) {
    throw new Error("samples output must remain inside the report directory");
  }
  if (existsSync(outputPath) || existsSync(samplesPath)) {
    throw new Error("merged evidence paths already exist; qualification artifacts are immutable");
  }
}

function safeArtifactPath(reportPath, value) {
  if (!value || isAbsolute(value) || value.split(/[\\/]/).includes("..")) {
    throw new Error(`${reportPath} has an unsafe raw artifact path`);
  }
  const reportDirectory = dirname(resolve(reportPath));
  const artifact = resolve(reportDirectory, value);
  if (!artifact.startsWith(`${reportDirectory}${sep}`)) {
    throw new Error(`${reportPath} raw artifact path escapes its report directory`);
  }
  return artifact;
}

function stableValue(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

async function inspectNdjsonArtifact(path) {
  const hash = createHash("sha256");
  let records = 0;
  let remainder = "";
  let endsWithNewline = false;
  const contributorTotals = new Map();
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    const text = remainder + chunk.toString("utf8");
    const lines = text.split("\n");
    remainder = lines.pop() ?? "";
    for (const line of lines.filter((entry) => entry.trim())) {
      records += 1;
      accumulateSampleContributors(contributorTotals, JSON.parse(line));
    }
    endsWithNewline = text.endsWith("\n");
  }
  if (remainder.trim()) {
    records += 1;
    accumulateSampleContributors(contributorTotals, JSON.parse(remainder));
  }
  return { records, endsWithNewline, sha256: hash.digest("hex"), contributorTotals };
}

function accumulateSampleContributors(totals, sample) {
  if (sample?.status !== "success") return;
  for (const timing of Array.isArray(sample.dependencyTimings) ? sample.dependencyTimings : []) {
    if (
      !timing?.name ||
      !Number.isFinite(timing.durationMs) ||
      timing.durationMs < 0 ||
      timing.controlledBy !== "Velo"
    )
      continue;
    const current = totals.get(timing.name) ?? { impactMs: 0, sampleCount: 0 };
    current.impactMs += timing.durationMs;
    current.sampleCount += 1;
    totals.set(timing.name, current);
  }
}

function mergeContributorTotals(target, source) {
  for (const [name, value] of source) {
    const current = target.get(name) ?? { impactMs: 0, sampleCount: 0 };
    current.impactMs += value.impactMs;
    current.sampleCount += value.sampleCount;
    target.set(name, current);
  }
}

function rankContributorTotals(totals) {
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

async function mergeArtifacts(sources, samplesPath) {
  const output = createWriteStream(samplesPath, { flags: "wx" });
  const hash = createHash("sha256");
  let records = 0;
  try {
    for (const source of sources) {
      for await (const chunk of createReadStream(source.artifactPath)) {
        hash.update(chunk);
        if (!output.write(chunk)) await once(output, "drain");
      }
      if (!source.endsWithNewline) {
        const newline = Buffer.from("\n");
        hash.update(newline);
        if (!output.write(newline)) await once(output, "drain");
      }
      records += source.report.sampleArtifact.records;
    }
    output.end();
    await once(output, "finish");
  } catch (error) {
    output.destroy();
    throw error;
  }
  return { records, sha256: hash.digest("hex") };
}
