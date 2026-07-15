import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadBenchmarkContract } from "./benchmark-contract.mjs";
import {
  buildQualificationCells,
  evaluateBenchmarkReport,
  indexBaselineArtifact,
  indexNdjsonArtifact,
  resolveSafeReportArtifact,
} from "./benchmark-gate-lib.mjs";
import { assembleWindowReports } from "./benchmark-merge-lib.mjs";
import { generateBenchmarkMarkdown } from "./benchmark-report-lib.mjs";
import { createScenarioAdapter, parseServerTimingHeader } from "./benchmark/adapters.mjs";
import {
  coldResetPayload,
  summarizeLifecycleSamples,
  validateLifecycleSample,
  writeNdjsonArtifact,
} from "./benchmark/lifecycle.mjs";

const contract = await loadBenchmarkContract();

test("Sprint 9 contract exposes exactly seven executable headline adapters", () => {
  assert.equal(contract.manifest.scenarios.length, 7);
  assert.equal(new Set(contract.manifest.scenarios).size, 7);
  for (const scenario of contract.scenarios.scenarios) {
    assert.ok(["http", "control"].includes(scenario.adapter), scenario.id);
    assert.equal("fixture" in scenario, false, scenario.id);
    assert.ok(scenario.primaryMetric, scenario.id);
    assert.ok(scenario.requiredMetrics.length > 0, scenario.id);
  }
});

test("Server-Timing parsing records valid Velo dependency durations", () => {
  assert.deepEqual(
    parseServerTimingHeader(
      'rate_limit;dur=12.345;desc="atomic admission", convex.action;dur=41, redis;desc="cache, primary";dur=3.2, missing, negative;dur=-1, invalid name;dur=9',
    ),
    [
      { name: "rate_limit", durationMs: 12.35, controlledBy: "Velo" },
      { name: "convex.action", durationMs: 41, controlledBy: "Velo" },
      { name: "redis", durationMs: 3.2, controlledBy: "Velo" },
    ],
  );
  assert.deepEqual(parseServerTimingHeader(null), []);
});

test("control adapter executes setup, real sample, and scoped cleanup", async () => {
  const scenario = contract.scenarios.scenarios.find(
    (entry) => entry.id === "checkout-preparation",
  );
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "DELETE")
      return jsonResponse({
        cleaned: true,
        captureId: "capture-1",
        cohortId: "cohort-sprint-9",
        receiptId: "cleanup-1",
        cleanedAt: "2026-07-13T01:30:00.000Z",
      });
    if (String(url).endsWith("/setup")) {
      return jsonResponse({
        authorized: true,
        authorizationId: "load-window-9",
        cohortId: "cohort-sprint-9",
        evidenceMode: "real",
        fixtureId: "fixture-1",
        setupReceiptId: "setup-1",
        temperatureApplied: "warm",
        profileApplied: "normal",
        clockProvenance: [remoteClock()],
      });
    }
    if (String(url).endsWith("/prime")) {
      return jsonResponse({ primed: true, evidenceMode: "real" });
    }
    return jsonResponse(realCheckoutSample());
  };
  const adapter = createScenarioAdapter(scenario, {
    fetchImpl,
    env: controlEnv(),
  });
  const context = runContext();
  const fixture = await adapter.setup(context);
  await adapter.prime(fixture, context);
  const sample = await adapter.execute(fixture, { ...context, sample: 0, scheduledAt: 1 });
  await adapter.cleanup(fixture, context);

  assert.equal(sample.status, "success");
  assert.equal(sample.evidenceMode, "real");
  assert.equal(calls.length, 4);
  assert.equal(calls[0].init.headers.authorization, "Bearer secret-token");
  assert.match(calls[0].init.headers["x-velo-benchmark-signature"], /^[a-f0-9]{64}$/);
  const signed = calls[0];
  const headers = signed.init.headers;
  const canonical = [
    signed.init.method,
    new URL(signed.url).pathname,
    headers["x-velo-benchmark-timestamp"],
    headers["x-velo-benchmark-nonce"],
    createHash("sha256").update(signed.init.body).digest("hex"),
    "capture-1",
    "load-window-9",
  ].join("\n");
  assert.equal(
    headers["x-velo-benchmark-signature"],
    createHmac("sha256", "hmac-secret").update(canonical).digest("hex"),
  );
  assert.equal(calls[3].method, undefined);
  assert.equal(calls[3].init.method, "DELETE");
  assert.doesNotMatch(JSON.stringify(sample), /secret-token/);
});

test("control adapter fails closed without authorization or a real-path handshake", async () => {
  const scenario = contract.scenarios.scenarios.find(
    (entry) => entry.id === "checkout-preparation",
  );
  await assert.rejects(
    () => createScenarioAdapter(scenario, { env: {} }).setup(runContext()),
    /missing required benchmark environment/,
  );
  const secretMissing = controlEnv();
  delete secretMissing.VELO_BENCHMARK_CONTROL_SECRET;
  await assert.rejects(
    () => createScenarioAdapter(scenario, { env: secretMissing }).setup(runContext()),
    /VELO_BENCHMARK_CONTROL_SECRET/,
  );
  const adapter = createScenarioAdapter(scenario, {
    env: controlEnv(),
    fetchImpl: async () =>
      jsonResponse({
        authorized: true,
        authorizationId: "load-window-9",
        evidenceMode: "synthetic",
        fixtureId: "fixture-1",
        clockProvenance: [remoteClock()],
        temperatureApplied: "warm",
        profileApplied: "normal",
      }),
  });
  await assert.rejects(() => adapter.setup(runContext()), /real-path evidence/);
});

test("HTTP adapter requires cohort control, validates outcomes, and rejects cold without reset evidence", async () => {
  const scenario = contract.scenarios.scenarios.find(
    (entry) => entry.id === "payment-intent-create",
  );
  const fetchImpl = async (url, init) => {
    if (String(url).includes("bench.example.test")) {
      if (String(url).endsWith("/setup")) {
        const request = JSON.parse(init.body);
        return jsonResponse({
          authorized: true,
          authorizationId: "load-window-9",
          evidenceMode: "real",
          cohortId: "cohort-sprint-9",
          fixtureId: "http-fixture-1",
          cleanupToken: "cleanup-token",
          setupReceiptId: "http-setup-1",
          temperatureApplied: request.temperature,
          profileApplied: request.profile,
        });
      }
      if (String(url).endsWith("/reset")) return jsonResponse({});
      return jsonResponse({
        cleaned: true,
        captureId: "capture-1",
        cohortId: "cohort-sprint-9",
        receiptId: "http-cleanup-1",
        cleanedAt: "2026-07-13T01:30:00.000Z",
      });
    }
    return new Response(JSON.stringify(publicPaymentIntent()), {
      status: 201,
      headers: {
        "content-type": "application/json",
        "server-timing": "rate_limit;dur=12.5, convex.action;dur=37.25",
        "x-correlation-id": "corr-http-1",
      },
    });
  };
  const adapter = createScenarioAdapter(scenario, { env: httpEnv(), fetchImpl });
  const context = runContext();
  const fixture = await adapter.setup(context);
  const sample = await adapter.execute(fixture, { ...context, sample: 0 });
  const cleanup = await adapter.cleanup(fixture, context);
  assert.equal(sample.status, "success");
  assert.equal(sample.outcome.object, "payment_intent");
  assert.deepEqual(sample.dependencyTimings, [
    { name: "rate_limit", durationMs: 12.5, controlledBy: "Velo" },
    { name: "convex.action", durationMs: 37.25, controlledBy: "Velo" },
  ]);
  assert.equal(sample.metrics[0].name, "http_request_ms");
  assert.equal(cleanup.controlled, true);

  const coldContext = { ...context, temperature: "cold" };
  const coldFixture = await adapter.setup(coldContext);
  const cold = await adapter.execute(coldFixture, { ...coldContext, sample: 0 });
  assert.equal(cold.status, "error");
  assert.equal(cold.errorDetail.code, "invalid_cold_reset_evidence");

  const invalidAdapter = createScenarioAdapter(scenario, {
    env: httpEnv(),
    fetchImpl: async (url, init) => {
      if (String(url).includes("bench.example.test")) return fetchImpl(url, init);
      return jsonResponse({ object: "unexpected" }, 201);
    },
  });
  const invalidFixture = await invalidAdapter.setup(context);
  const invalid = await invalidAdapter.execute(invalidFixture, { ...context, sample: 1 });
  assert.equal(invalid.status, "error");
  assert.equal(invalid.errorDetail.code, "invalid_http_outcome");
});

test("HTTP warm prime preserves the response failure that blocked capture", async () => {
  const scenario = contract.scenarios.scenarios.find(
    (entry) => entry.id === "payment-intent-create",
  );
  const fetchImpl = async (url) => {
    if (String(url).includes("bench.example.test")) {
      if (String(url).endsWith("/setup")) {
        return jsonResponse({
          authorized: true,
          authorizationId: "load-window-9",
          evidenceMode: "real",
          cohortId: "cohort-sprint-9",
          fixtureId: "http-fixture-1",
          cleanupToken: "cleanup-token",
          setupReceiptId: "http-setup-1",
          temperatureApplied: "warm",
          profileApplied: "normal",
        });
      }
      return jsonResponse({
        cleaned: true,
        captureId: "capture-1",
        cohortId: "cohort-sprint-9",
        receiptId: "http-cleanup-1",
        cleanedAt: "2026-07-13T01:30:00.000Z",
      });
    }
    return new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "2",
      },
    });
  };
  const adapter = createScenarioAdapter(scenario, { env: httpEnv(), fetchImpl });
  const context = runContext();
  const fixture = await adapter.setup(context);
  await assert.rejects(
    () => adapter.prime(fixture, context),
    /payment-intent-create warm prime failed: HTTP 429; class=http_4xx/,
  );
  await adapter.cleanup(fixture, context);
});

test("lifecycle validation enforces named boundaries and millisecond units", () => {
  const scenario = contract.scenarios.scenarios.find(
    (entry) => entry.id === "checkout-preparation",
  );
  assert.deepEqual(validateLifecycleSample(realCheckoutSample(), scenario, [remoteClock()]), []);
  const invalid = realCheckoutSample();
  invalid.metrics[0].unit = "seconds";
  invalid.metrics[0].durationMs = 1;
  invalid.lifecycle.pop();
  const errors = validateLifecycleSample(invalid, scenario, [remoteClock()]).join(" ");
  assert.match(errors, /unit must be ms/);
  assert.match(errors, /missing lifecycle event checkout.ready/);
});

test("raw NDJSON is reproducible and lifecycle summaries retain every clock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "velo-benchmark-"));
  const path = join(directory, "samples.ndjson");
  const records = [
    { runId: "run-1", scenario: "checkout-preparation", ...realCheckoutSample() },
    { runId: "run-1", scenario: "checkout-preparation", ...realCheckoutSample() },
  ];
  const artifact = await writeNdjsonArtifact(path, records);
  const persisted = (await readFile(path, "utf8")).trim().split("\n").map(JSON.parse);
  const summary = summarizeLifecycleSamples(persisted, "checkout_preparation_ms");

  assert.equal(artifact.records, 2);
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(persisted, records);
  assert.equal(summary.lifecycleMetrics.checkout_preparation_ms.count, 2);
  assert.equal(summary.clockEvents, 4);
});

test("raw index recomputes required distributions and verifies cold reset HMAC", async () => {
  const directory = await mkdtemp(join(tmpdir(), "velo-raw-index-"));
  const path = join(directory, "samples.ndjson");
  const sample = {
    manifestVersion: 3,
    evidenceSchemaVersion: 2,
    runId: "cold-run-1",
    captureId: "capture-1",
    cohortId: "cohort-sprint-9",
    scenario: "checkout-preparation",
    profile: "normal",
    temperature: "cold",
    window: "morning",
    sample: 0,
    clockProvenance: [remoteClock()],
    ...realCheckoutSample(),
  };
  sample.coldResetEvidence = signedColdReset(sample);
  await writeNdjsonArtifact(path, [sample]);
  const index = await indexNdjsonArtifact(path, contract, { controlSecret: "hmac-secret" });
  assert.equal(index.malformedCount, 0, index.malformed.join("\n"));
  assert.deepEqual(index.byRun["cold-run-1"].lifecycleMetrics.checkout_preparation_ms, {
    unit: "ms",
    count: 1,
    p50: 12,
    p95: 12,
    p99: 12,
    max: 12,
  });
  assert.equal(index.byRun["cold-run-1"].coldResetVerified, 1);
});

test("qualification gate requires all seven scenarios and the exact 84-cell matrix", async () => {
  const report = qualifyingReport();
  const artifactIndex = qualifyingArtifactIndex(report);
  const passing = await evaluateFixtureReport(report, artifactIndex);
  assert.equal(passing.status, "pass", passing.failures.join("\n"));

  const regressed = qualifyingReport();
  regressed.runs[0].latencyMs.p95 =
    regressed.baseline.scenarios[regressed.runs[0].scenario].p95 * 1.06;
  regressed.runs[0].lifecycleMetrics.http_request_ms = regressed.runs[0].latencyMs;
  const regression = await evaluateFixtureReport(regressed);
  assert.match(regression.failures.join(" "), /baseline-relative gate/);

  const tamperedSummary = qualifyingReport();
  const rawDistributions = qualifyingArtifactIndex(tamperedSummary);
  tamperedSummary.runs[0].lifecycleMetrics.http_request_ms.p95 -= 5;
  tamperedSummary.runs[0].latencyMs = tamperedSummary.runs[0].lifecycleMetrics.http_request_ms;
  const tamperedResult = await evaluateFixtureReport(tamperedSummary, rawDistributions);
  assert.match(tamperedResult.failures.join(" "), /summary differs from raw NDJSON/);

  const outsideWindow = qualifyingReport();
  const afternoon = outsideWindow.sourceCaptures.find((source) => source.window === "afternoon");
  afternoon.startedAt = "2026-07-13T02:00:00.000Z";
  afternoon.completedAt = "2026-07-13T02:30:00.000Z";
  const outsideResult = await evaluateFixtureReport(outsideWindow);
  assert.match(outsideResult.failures.join(" "), /outside its declared UTC window/);

  const tooClose = qualifyingReport();
  const morning = tooClose.sourceCaptures.find((source) => source.window === "morning");
  const closeAfternoon = tooClose.sourceCaptures.find((source) => source.window === "afternoon");
  morning.startedAt = "2026-07-13T07:00:00.000Z";
  morning.completedAt = "2026-07-13T07:30:00.000Z";
  closeAfternoon.startedAt = "2026-07-13T08:00:00.000Z";
  closeAfternoon.completedAt = "2026-07-13T08:30:00.000Z";
  const separationResult = await evaluateFixtureReport(tooClose);
  assert.match(separationResult.failures.join(" "), /chronologically separated/);

  const incompleteCold = qualifyingReport();
  const incompleteIndex = qualifyingArtifactIndex(incompleteCold);
  const coldRun = incompleteCold.runs.find((run) => run.temperature === "cold");
  incompleteIndex.byRun[coldRun.runId].coldResetVerified -= 1;
  const coldResult = await evaluateFixtureReport(incompleteCold, incompleteIndex);
  assert.match(coldResult.failures.join(" "), /raw NDJSON cold reset evidence is incomplete/);

  const missing = structuredClone(report);
  const removed = missing.runs.pop();
  missing.sampleArtifact.records -= removed.successfulSamples;
  delete artifactIndex.byRun[removed.runId];
  artifactIndex.records -= removed.successfulSamples;
  const rejected = await evaluateFixtureReport(missing, artifactIndex);
  assert.equal(rejected.status, "fail");
  assert.match(rejected.failures.join(" "), /missing required cell/);

  const metadataMissing = qualifyingReport();
  metadataMissing.baseline = {};
  metadataMissing.contributors = [];
  const metadataResult = await evaluateFixtureReport(metadataMissing);
  assert.match(metadataResult.failures.join(" "), /baseline/);
  assert.match(metadataResult.failures.join(" "), /three raw-derived Velo-controlled contributors/);
});

test("qualification gate independently verifies the baseline artifact and rejects forgery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "velo-baseline-"));
  const reportPath = join(directory, "qualification.json");
  const baselinePath = join(directory, "approved-baseline.json");
  const report = qualifyingReport();
  const baselineValue = qualifyingBaselineIndex(report).value;
  const baselineBytes = JSON.stringify(baselineValue);
  await writeFile(reportPath, "{}", { flag: "wx" });
  await writeFile(baselinePath, baselineBytes, { flag: "wx" });

  const resolved = await resolveSafeReportArtifact(
    reportPath,
    "approved-baseline.json",
    "baseline artifact",
  );
  const baselineIndex = await indexBaselineArtifact(resolved);
  report.baseline.artifact = "approved-baseline.json";
  report.baseline.sha256 = createHash("sha256").update(baselineBytes).digest("hex");
  const passing = await evaluateBenchmarkReport(report, {
    contract,
    artifactIndex: qualifyingArtifactIndex(report),
    baselineIndex,
  });
  assert.equal(passing.status, "pass", passing.failures.join("\n"));

  report.baseline.scenarios[contract.manifest.scenarios[0]].p95 += 1;
  const forged = await evaluateBenchmarkReport(report, {
    contract,
    artifactIndex: qualifyingArtifactIndex(report),
    baselineIndex,
  });
  assert.match(forged.failures.join(" "), /baseline artifact .* p95 does not match/);
  await assert.rejects(
    () => resolveSafeReportArtifact(reportPath, "../baseline.json", "baseline artifact"),
    /safe path relative to the report/,
  );
});

test("qualification gate rejects an invented contributor absent from raw timings", async () => {
  const report = qualifyingReport();
  const artifactIndex = qualifyingArtifactIndex(report);
  report.contributors[0].name = "invented-fast-path";
  const result = await evaluateFixtureReport(report, artifactIndex);
  assert.match(result.failures.join(" "), /differs from raw dependency timings/);
});

test("human report renders baseline, contributors, raw evidence, and lifecycle clocks", () => {
  const markdown = generateBenchmarkMarkdown(qualifyingReport());
  assert.match(markdown, /Approved baseline/);
  assert.match(markdown, /approved-sprint-8/);
  assert.match(markdown, /route_selection/);
  assert.match(markdown, /qualification\.ndjson/);
  assert.match(markdown, /checkout_preparation_ms/);
  assert.doesNotMatch(markdown, /unresolved/);
});

test("assembler combines three immutable 28-cell windows and rejects frozen-control drift", async () => {
  const directory = await mkdtemp(join(tmpdir(), "velo-window-merge-"));
  const reportPaths = await writeWindowPartials(directory);
  const assembled = await assembleWindowReports({
    reportPaths,
    outputPath: join(directory, "final.json"),
    samplesPath: join(directory, "final.ndjson"),
    contract,
  });
  assert.equal(assembled.report.runs.length, 84);
  assert.equal(assembled.report.sourceCaptures.length, 3);
  assert.equal(assembled.report.sampleArtifact.records, 84);
  assert.match(assembled.report.sampleArtifact.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(assembled.report.contributors, [
    {
      rank: 1,
      name: "serialization",
      controlledBy: "Velo",
      impactMs: 336,
      sampleCount: 84,
    },
    {
      rank: 2,
      name: "state_transition",
      controlledBy: "Velo",
      impactMs: 224,
      sampleCount: 84,
    },
    {
      rank: 3,
      name: "route_selection",
      controlledBy: "Velo",
      impactMs: 154,
      sampleCount: 84,
    },
  ]);
  await assert.rejects(
    () =>
      assembleWindowReports({
        reportPaths,
        outputPath: join(directory, "final.json"),
        samplesPath: join(directory, "final.ndjson"),
        contract,
      }),
    /already exist/,
  );

  const afternoon = JSON.parse(await readFile(reportPaths[1], "utf8"));
  afternoon.cohortId = "different-cohort";
  afternoon.runs = afternoon.runs.map((run) => ({ ...run, cohortId: "different-cohort" }));
  await writeFile(reportPaths[1], JSON.stringify(afternoon));
  await assert.rejects(
    () =>
      assembleWindowReports({
        reportPaths,
        outputPath: join(directory, "drift.json"),
        samplesPath: join(directory, "drift.ndjson"),
        contract,
      }),
    /same frozen cohortId/,
  );
  await assert.rejects(
    () =>
      assembleWindowReports({
        reportPaths,
        outputPath: join(directory, "escaped", "final.json"),
        samplesPath: join(directory, "outside.ndjson"),
        contract,
      }),
    /inside the report directory/,
  );
});

function qualifyingReport() {
  const runs = buildQualificationCells(contract).map((cell, index) => {
    const scenario = contract.scenarios.scenarios.find((entry) => entry.id === cell.scenario);
    const slo = contract.manifest.thresholds.latencySloMs[cell.scenario];
    const latencyMs = {
      unit: "ms",
      p50: slo.p50 - 1,
      p95: slo.p95 - 1,
      p99: slo.p99 - 1,
      max: slo.p99 - 1,
      count: 1000,
    };
    const lifecycleMetrics = Object.fromEntries(
      scenario.requiredMetrics.map((metric) => [
        metric,
        { unit: "ms", count: 1000, p50: 1, p95: 2, p99: 3, max: 4 },
      ]),
    );
    lifecycleMetrics[scenario.primaryMetric] = latencyMs;
    return {
      status: "captured",
      evidenceMode: "real",
      manifestVersion: contract.manifest.version,
      evidenceSchemaVersion: 2,
      runId: `run-${index}`,
      captureId: `capture-${cell.window}`,
      cohortId: "cohort-sprint-9",
      scenario: cell.scenario,
      scenarioVersion: scenario.version,
      adapter: scenario.adapter,
      profile: cell.profile,
      temperature: cell.temperature,
      window: cell.window,
      mode: "capture",
      revision: "abcdef123456",
      capturedAt: `2026-07-13T${windowHour(cell.window)}:00:00.000Z`,
      region: "test-region",
      runtime: "node-test",
      network: "stellar-testnet",
      dependencyVersions: "pinned",
      dependencyEndpoints: "authorized-staging",
      payloadIdentity: "payload-v1",
      datasetIdentity: "dataset-v1",
      clockProvenance: [remoteClock()],
      fixtureControl: {
        authorized: true,
        cohortId: "cohort-sprint-9",
        setupReceiptId: `setup-${index}`,
        cleanup: {
          controlled: true,
          cohortId: "cohort-sprint-9",
          receiptId: `cleanup-${index}`,
        },
      },
      coldReset: {
        required: cell.temperature === "cold",
        verifiedSamples: cell.temperature === "cold" ? 1000 : 0,
        methods: cell.temperature === "cold" ? ["controller-fixture-reset"] : [],
      },
      workload: {
        requestedSamples: 1000,
        attemptedSamples: 1000,
        successfulSamples: 1000,
        concurrency: cell.profile === "growth" ? 100 : 25,
        timeoutMs: 10000,
        targetRequestsPerSecond: cell.profile === "growth" ? 50 : 10,
      },
      pacing: {
        targetRequestsPerSecond: cell.profile === "growth" ? 50 : 10,
        achievedRequestsPerSecond: cell.profile === "growth" ? 50 : 10,
      },
      saturation: { saturatedArrivals: 0, droppedArrivals: 0, maxInFlight: 1 },
      attemptedSamples: 1000,
      successfulSamples: 1000,
      errorSamples: 0,
      droppedSamples: 0,
      throughput: {
        attemptedPerSecond: cell.profile === "growth" ? 50 : 10,
        successfulPerSecond: cell.profile === "growth" ? 50 : 10,
      },
      errorTaxonomy: {
        timeout: 0,
        http_4xx: 0,
        http_5xx: 0,
        http_5xx_503: 0,
        network: 0,
        lifecycle: 0,
        authorization: 0,
        dropped: 0,
        unknown: 0,
      },
      http503: { count: 0, attributedCount: 0, unattributedCount: 0, byDependency: {} },
      latencyMs,
      lifecycleMetrics,
    };
  });
  return {
    status: "suite_completed",
    manifestVersion: contract.manifest.version,
    evidenceSchemaVersion: 2,
    capturedAt: "2026-07-13T02:00:00.000Z",
    cohortId: "cohort-sprint-9",
    revision: "abcdef123456",
    baseline: {
      id: "approved-sprint-8",
      revision: "abc123",
      capturedAt: "2026-07-12T02:00:00.000Z",
      artifact: "sprint-8.json",
      sha256: "b".repeat(64),
      scenarios: Object.fromEntries(
        contract.manifest.scenarios.map((scenario) => [
          scenario,
          { p95: contract.manifest.thresholds.latencySloMs[scenario].p95 },
        ]),
      ),
    },
    contributors: [
      {
        rank: 1,
        name: "route_selection",
        controlledBy: "Velo",
        impactMs: 300,
        sampleCount: 100,
      },
      {
        rank: 2,
        name: "state_transition",
        controlledBy: "Velo",
        impactMs: 200,
        sampleCount: 100,
      },
      {
        rank: 3,
        name: "serialization",
        controlledBy: "Velo",
        impactMs: 100,
        sampleCount: 100,
      },
    ],
    sampleArtifact: {
      format: "ndjson",
      path: "qualification.ndjson",
      sha256: "a".repeat(64),
      records: runs.reduce((sum, run) => sum + run.attemptedSamples, 0),
    },
    sourceCaptures: contract.manifest.windows.map((window, index) => ({
      window,
      captureId: `capture-${window}`,
      cohortId: "cohort-sprint-9",
      revision: "abcdef123456",
      startedAt: `2026-07-13T${windowHour(window)}:00:00.000Z`,
      completedAt: `2026-07-13T${windowHour(window)}:30:00.000Z`,
      capturedAt: `2026-07-13T${windowHour(window)}:30:00.000Z`,
      reportSha256: String(index + 1).repeat(64),
    })),
    runs,
  };
}

function qualifyingArtifactIndex(report) {
  return {
    records: report.sampleArtifact.records,
    sha256: report.sampleArtifact.sha256,
    malformed: [],
    contributors: structuredClone(report.contributors),
    byRun: Object.fromEntries(
      report.runs.map((run) => [
        run.runId,
        {
          attempted: run.attemptedSamples,
          successful: run.successfulSamples,
          lifecycleMetrics: structuredClone(run.lifecycleMetrics),
          coldResetVerified: run.temperature === "cold" ? run.successfulSamples : 0,
        },
      ]),
    ),
  };
}

function qualifyingBaselineIndex(report) {
  return {
    sha256: report.baseline?.sha256,
    value: {
      revision: report.baseline?.revision,
      capturedAt: report.baseline?.capturedAt,
      scenarios: structuredClone(report.baseline?.scenarios),
    },
  };
}

function evaluateFixtureReport(report, artifactIndex = qualifyingArtifactIndex(report)) {
  return evaluateBenchmarkReport(report, {
    contract,
    artifactIndex,
    baselineIndex: qualifyingBaselineIndex(report),
  });
}

async function writeWindowPartials(directory) {
  const qualification = qualifyingReport();
  const paths = [];
  for (const window of contract.manifest.windows) {
    const captureId = `capture-${window}`;
    const runs = qualification.runs
      .filter((run) => run.window === window)
      .map((run) => ({
        ...run,
        captureId,
        attemptedSamples: 1,
        successfulSamples: 1,
        workload: {
          ...run.workload,
          requestedSamples: 1,
          attemptedSamples: 1,
          successfulSamples: 1,
        },
        latencyMs: { ...run.latencyMs, count: 1 },
        lifecycleMetrics: Object.fromEntries(
          Object.entries(run.lifecycleMetrics).map(([name, value]) => [
            name,
            { ...value, count: 1 },
          ]),
        ),
      }));
    const raw =
      runs
        .map((run) =>
          JSON.stringify({
            runId: run.runId,
            scenario: run.scenario,
            status: "success",
            dependencyTimings: windowDependencyTimings(window),
          }),
        )
        .join("\n") + "\n";
    const artifactName = `${window}.ndjson`;
    await writeFile(join(directory, artifactName), raw);
    const report = {
      status: "window_completed",
      captureId,
      cohortId: qualification.cohortId,
      revision: qualification.revision,
      manifestVersion: qualification.manifestVersion,
      evidenceSchemaVersion: qualification.evidenceSchemaVersion,
      startedAt: `2026-07-13T${windowHour(window)}:00:00.000Z`,
      completedAt: `2026-07-13T${windowHour(window)}:30:00.000Z`,
      capturedAt: `2026-07-13T${windowHour(window)}:30:00.000Z`,
      baseline: qualification.baseline,
      contributors: qualification.contributors,
      sampleArtifact: {
        format: "ndjson",
        path: artifactName,
        sha256: createHash("sha256").update(raw).digest("hex"),
        records: runs.length,
      },
      runs,
    };
    const reportPath = join(directory, `${window}.json`);
    await writeFile(reportPath, JSON.stringify(report));
    paths.push(reportPath);
  }
  return paths;
}

function windowDependencyTimings(window) {
  const durations = {
    morning: { route_selection: 3, state_transition: 2, serialization: 1 },
    afternoon: { route_selection: 0.5, state_transition: 5, serialization: 4 },
    evening: { route_selection: 2, state_transition: 1, serialization: 7 },
  }[window];
  return Object.entries(durations).map(([name, durationMs]) => ({
    name,
    durationMs,
    controlledBy: "Velo",
  }));
}

function windowHour(window) {
  return { morning: "01", afternoon: "09", evening: "17" }[window];
}

function runContext() {
  return {
    captureId: "capture-1",
    cohortId: "cohort-sprint-9",
    runId: "run-1",
    scenario: "checkout-preparation",
    profile: "normal",
    temperature: "warm",
    window: "morning",
    targetSamples: 1,
    timeoutMs: 1000,
  };
}

function controlEnv() {
  return {
    VELO_BENCHMARK_CONTROL_URL: "https://bench.example.test/v1/benchmark",
    VELO_BENCHMARK_CONTROL_TOKEN: "secret-token",
    VELO_BENCHMARK_CONTROL_SECRET: "hmac-secret",
    VELO_BENCHMARK_AUTHORIZATION_ID: "load-window-9",
  };
}

function httpEnv() {
  return {
    ...controlEnv(),
    VELO_BENCHMARK_BASE_URL: "https://api.example.test",
    VELO_BENCHMARK_API_KEY: "api-key",
  };
}

function publicPaymentIntent() {
  return {
    object: "payment_intent",
    id: "pi-1",
    paymentIntentId: "pi-1",
    status: "pending",
    amount: "1.00",
    asset: "USDC",
    checkoutUrl: "https://app.example.test/pay/pi-1",
  };
}

function signedColdReset(sample) {
  const evidence = {
    applied: true,
    resetId: `reset-${sample.sample}`,
    method: "controller-fixture-reset",
    authorizationId: "load-window-9",
    captureId: sample.captureId,
    cohortId: sample.cohortId,
    sample: sample.sample,
    resetAtEpochMs: 900,
  };
  const payload = coldResetPayload(evidence);
  return {
    ...evidence,
    attestation: {
      algorithm: "hmac-sha256",
      payloadSha256: createHash("sha256").update(payload).digest("hex"),
      signature: createHmac("sha256", "hmac-secret").update(payload).digest("hex"),
      verified: true,
    },
  };
}

function remoteClock() {
  return {
    id: "control-wall",
    source: "authorized-control",
    kind: "wall",
    unit: "ms",
    synchronization: "ntp",
    resolutionMs: 1,
  };
}

function realCheckoutSample() {
  return {
    status: "success",
    evidenceMode: "real",
    correlationId: "corr-1",
    lifecycle: [
      {
        name: "checkout.navigation_start",
        epochMs: 1000,
        source: "browser",
        clockDomain: "control-wall",
        provenanceId: "control-wall",
      },
      {
        name: "checkout.ready",
        epochMs: 1012,
        source: "browser",
        clockDomain: "control-wall",
        provenanceId: "control-wall",
      },
    ],
    metrics: [
      {
        name: "checkout_preparation_ms",
        unit: "ms",
        startEvent: "checkout.navigation_start",
        endEvent: "checkout.ready",
        durationMs: 12,
      },
    ],
    dependencyTimings: [],
    queueDepth: 0,
    eventLagMs: 0,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
