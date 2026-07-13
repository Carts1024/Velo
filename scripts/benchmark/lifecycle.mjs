import { createHash, createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const EVIDENCE_SCHEMA_VERSION = 2;

export function runnerClockProvenance() {
  return {
    id: "runner-monotonic",
    source: "node-benchmark-runner",
    kind: "monotonic",
    unit: "ms",
    synchronization: "same-process",
    resolutionMs: 0.01,
  };
}

export function runnerClockEvent(name, monotonicMs, source = "node-benchmark-runner") {
  return {
    name,
    epochMs: performance.timeOrigin + monotonicMs,
    monotonicMs,
    source,
    clockDomain: "runner-monotonic",
    provenanceId: "runner-monotonic",
  };
}

export function validateClockProvenance(provenance) {
  const errors = [];
  if (!Array.isArray(provenance) || provenance.length === 0) {
    return ["clockProvenance must contain at least one clock"];
  }
  const ids = new Set();
  for (const [index, clock] of provenance.entries()) {
    const prefix = `clockProvenance[${index}]`;
    if (!clock?.id) errors.push(`${prefix}.id is required`);
    else if (ids.has(clock.id)) errors.push(`${prefix}.id is duplicated`);
    else ids.add(clock.id);
    if (!clock?.source) errors.push(`${prefix}.source is required`);
    if (!["monotonic", "wall"].includes(clock?.kind)) errors.push(`${prefix}.kind is invalid`);
    if (clock?.unit !== "ms") errors.push(`${prefix}.unit must be ms`);
    if (!clock?.synchronization || clock.synchronization === "unknown") {
      errors.push(`${prefix}.synchronization must be declared`);
    }
    if (!Number.isFinite(clock?.resolutionMs) || clock.resolutionMs <= 0) {
      errors.push(`${prefix}.resolutionMs must be positive`);
    }
  }
  return errors;
}

export function validateLifecycleSample(sample, scenario, clockProvenance) {
  const errors = [];
  if (sample?.status !== "success") return errors;
  if (sample.evidenceMode !== "real") errors.push("successful sample must use real evidenceMode");
  const provenanceErrors = validateClockProvenance(clockProvenance);
  errors.push(...provenanceErrors);
  const clocks = new Map((clockProvenance ?? []).map((clock) => [clock.id, clock]));
  const events = new Map();
  for (const [index, event] of (sample.lifecycle ?? []).entries()) {
    const prefix = `lifecycle[${index}]`;
    if (!event?.name) {
      errors.push(`${prefix}.name is required`);
      continue;
    }
    if (events.has(event.name)) errors.push(`duplicate lifecycle event ${event.name}`);
    events.set(event.name, event);
    if (!Number.isFinite(event.epochMs) || event.epochMs < 0) {
      errors.push(`${event.name}.epochMs must be non-negative milliseconds`);
    }
    if (!event.source) errors.push(`${event.name}.source is required`);
    if (!event.clockDomain) errors.push(`${event.name}.clockDomain is required`);
    if (!clocks.has(event.provenanceId)) {
      errors.push(`${event.name}.provenanceId is not declared`);
    }
  }
  for (const event of scenario.requiredEvents ?? []) {
    if (!events.has(event)) errors.push(`missing lifecycle event ${event}`);
  }

  const metrics = new Map();
  for (const [index, metric] of (sample.metrics ?? []).entries()) {
    const prefix = `metrics[${index}]`;
    if (!metric?.name) {
      errors.push(`${prefix}.name is required`);
      continue;
    }
    if (metrics.has(metric.name)) errors.push(`duplicate lifecycle metric ${metric.name}`);
    metrics.set(metric.name, metric);
    if (metric.unit !== "ms") errors.push(`${metric.name}.unit must be ms`);
    if (!Number.isFinite(metric.durationMs) || metric.durationMs < 0) {
      errors.push(`${metric.name}.durationMs must be non-negative`);
    }
    const start = events.get(metric.startEvent);
    const end = events.get(metric.endEvent);
    if (!start) errors.push(`${metric.name} missing start event ${metric.startEvent}`);
    if (!end) errors.push(`${metric.name} missing end event ${metric.endEvent}`);
    if (start && end && Number.isFinite(metric.durationMs)) {
      const startClock = clocks.get(start.provenanceId);
      const endClock = clocks.get(end.provenanceId);
      let observed;
      if (
        start.provenanceId === end.provenanceId &&
        startClock?.kind === "monotonic" &&
        Number.isFinite(start.monotonicMs) &&
        Number.isFinite(end.monotonicMs)
      ) {
        observed = end.monotonicMs - start.monotonicMs;
      } else {
        observed = end.epochMs - start.epochMs;
      }
      const tolerance = Math.max(startClock?.resolutionMs ?? 1, endClock?.resolutionMs ?? 1, 1);
      if (observed < 0) errors.push(`${metric.name} clock boundary is reversed`);
      else if (Math.abs(observed - metric.durationMs) > tolerance) {
        errors.push(`${metric.name}.durationMs does not match lifecycle boundaries`);
      }
    }
  }
  for (const metric of scenario.requiredMetrics ?? []) {
    if (!metrics.has(metric)) errors.push(`missing lifecycle metric ${metric}`);
  }
  return errors;
}

export function coldResetPayload(evidence) {
  return [
    evidence?.resetId,
    evidence?.method,
    evidence?.authorizationId,
    evidence?.captureId,
    evidence?.cohortId,
    String(evidence?.sample),
    String(evidence?.resetAtEpochMs),
  ].join("\n");
}

export function validateColdResetEvidence(sample, { secret } = {}) {
  const evidence = sample?.coldResetEvidence;
  const errors = [];
  if (evidence?.applied !== true) errors.push("cold reset was not applied");
  for (const key of ["resetId", "method", "authorizationId", "captureId", "cohortId"]) {
    if (!evidence?.[key]) errors.push(`cold reset ${key} is required`);
  }
  if (evidence?.captureId !== sample?.captureId || evidence?.cohortId !== sample?.cohortId) {
    errors.push("cold reset is not bound to the sample capture/cohort");
  }
  if (String(evidence?.sample) !== String(sample?.sample))
    errors.push("cold reset is not bound to the sample index");
  if (!Number.isFinite(evidence?.resetAtEpochMs) || evidence.resetAtEpochMs < 0)
    errors.push("cold reset timestamp is invalid");
  const payloadSha256 = createHash("sha256").update(coldResetPayload(evidence)).digest("hex");
  if (evidence?.attestation?.payloadSha256 !== payloadSha256)
    errors.push("cold reset payload digest is invalid");
  if (evidence?.attestation?.algorithm !== "hmac-sha256")
    errors.push("cold reset attestation algorithm is invalid");
  if (!/^[a-f0-9]{64}$/.test(evidence?.attestation?.signature ?? ""))
    errors.push("cold reset attestation signature is invalid");
  if (evidence?.attestation?.verified !== true)
    errors.push("cold reset attestation was not verified by the adapter");
  if (!secret) errors.push("cold reset attestation verification secret is required");
  else {
    const expectedSignature = createHmac("sha256", secret)
      .update(coldResetPayload(evidence))
      .digest("hex");
    if (evidence?.attestation?.signature !== expectedSignature)
      errors.push("cold reset attestation HMAC verification failed");
  }
  return errors;
}

export function summarizeLifecycleSamples(samples, primaryMetric) {
  const successful = samples.filter((sample) => sample.status === "success");
  const values = new Map();
  let clockEvents = 0;
  for (const sample of successful) {
    clockEvents += sample.lifecycle?.length ?? 0;
    for (const metric of sample.metrics ?? []) {
      const durations = values.get(metric.name) ?? [];
      durations.push(metric.durationMs);
      values.set(metric.name, durations);
    }
  }
  const lifecycleMetrics = Object.fromEntries(
    [...values.entries()].map(([name, durations]) => [name, summarizeDurations(durations)]),
  );
  return {
    lifecycleMetrics,
    latencyMs: lifecycleMetrics[primaryMetric] ?? emptyDistribution(),
    clockEvents,
    dependencyTimingMs: summarizeNamedTimings(successful, "dependencyTimings"),
    queueDepth: summarizeDurations(
      successful.map((sample) => sample.queueDepth).filter(Number.isFinite),
    ),
    eventLagMs: summarizeDurations(
      successful.map((sample) => sample.eventLagMs).filter(Number.isFinite),
    ),
  };
}

export function summarizeDurations(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return emptyDistribution();
  return {
    unit: "ms",
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1),
  };
}

export async function writeNdjsonArtifact(path, records) {
  const content = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, { flag: "wx" });
  return {
    format: "ndjson",
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
    records: records.length,
  };
}

function summarizeNamedTimings(samples, key) {
  const timings = new Map();
  for (const sample of samples) {
    for (const timing of sample[key] ?? []) {
      if (!timing?.name || !Number.isFinite(timing.durationMs)) continue;
      const values = timings.get(timing.name) ?? [];
      values.push(timing.durationMs);
      timings.set(timing.name, values);
    }
  }
  return Object.fromEntries(
    [...timings.entries()].map(([name, values]) => [name, summarizeDurations(values)]),
  );
}

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}

function emptyDistribution() {
  return { unit: "ms", count: 0, p50: null, p95: null, p99: null, max: null };
}
