import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const SPRINT11_MANIFEST_PATH = "benchmarks/sprint11/manifest.json";
export const SPRINT11_EVIDENCE_SCHEMA_VERSION = 3;

export async function loadSprint11Contract({ manifestPath = SPRINT11_MANIFEST_PATH } = {}) {
  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
  const errors = validateSprint11Manifest(manifest);
  if (errors.length) throw new Error(`Invalid Sprint 11 manifest: ${errors.join("; ")}`);
  return { manifest };
}

export function validateSprint11Manifest(manifest, { requireFrozen = false } = {}) {
  const errors = [];
  if ((manifest?.manifestVersion ?? manifest?.version) !== 4) errors.push("manifestVersion must be 4");
  if (manifest?.evidenceSchemaVersion !== SPRINT11_EVIDENCE_SCHEMA_VERSION)
    errors.push("evidenceSchemaVersion must be 3");
  if (manifest?.qualification !== "sprint-11") errors.push("qualification must be sprint-11");
  if (!Array.isArray(manifest?.windows) || manifest.windows.length !== 3)
    errors.push("exactly three qualification windows are required");
  if (manifest?.windowPolicy?.timezone !== "UTC") errors.push("windowPolicy timezone must be UTC");
  if (!Array.isArray(manifest?.scenarios) || manifest.scenarios.length !== 7)
    errors.push("exactly seven headline scenarios are required");
  if (!Array.isArray(manifest?.arms) || manifest.arms.length < 8) errors.push("qualification arms are required");
  const workload = manifest?.workload;
  if (!Number.isFinite(workload?.normalRequestsPerSecond) || !Number.isFinite(workload?.growthRequestsPerSecond))
    errors.push("normal and growth operating points are required");
  if (requireFrozen) {
    for (const [name, value] of Object.entries(manifest?.infrastructure ?? {}))
      if (name !== "dependencies" && name !== "endpoints" && (!value || value === "unresolved")) errors.push(`infrastructure.${name} is unresolved`);
    for (const [name, value] of Object.entries(manifest?.confirmation ?? {})) if (!value || value === "unresolved") errors.push(`confirmation.${name} is unresolved`);
  }
  if (!Number.isFinite(manifest?.slo?.headroomFraction) || manifest.slo.headroomFraction < 0) errors.push("slo headroom is required");
  if (requireFrozen) {
    if (!manifest?.baseline?.revision || manifest.baseline.revision === "unresolved") errors.push("baseline revision is unresolved");
    if (!manifest?.candidate?.revision || manifest.candidate.revision === "unresolved") errors.push("candidate revision is unresolved");
    if (!Number.isFinite(workload?.soakDurationSeconds) || workload.soakDurationSeconds <= 0) errors.push("soak duration is required");
    for (const [name, value] of Object.entries(workload?.capacitySearch ?? {})) if (!Number.isFinite(value) || value <= 0) errors.push(`capacitySearch.${name} is required`);
    if (!Number.isFinite(manifest?.slo?.recoveryDeadlineSeconds) || manifest.slo.recoveryDeadlineSeconds <= 0) errors.push("recovery deadline is required");
    for (const [name, value] of Object.entries(manifest?.authorization ?? {})) if (name !== "competitor" && (!value || value === "unresolved")) errors.push(`authorization.${name} is unresolved`);
    if (manifest.status !== "frozen") errors.push("manifest must be frozen before qualification");
    if (!/^[a-f0-9]{64}$/.test(manifest.manifestDigest ?? "")) errors.push("frozen manifest digest is required");
    if (manifest.frozenAt === undefined) errors.push("frozenAt is required");
  }
  return errors;
}

export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

export function digest(value) { return createHash("sha256").update(canonicalize(value)).digest("hex"); }

export function freezeManifest(manifest, { revision, gitStatus = [], frozenAt = new Date().toISOString() } = {}) {
  if (gitStatus.length) throw new Error(`Cannot freeze dirty revision: ${gitStatus.join(", ")}`);
  if (!revision || revision === "unresolved") throw new Error("Cannot freeze unresolved revision");
  const errors = validateSprint11Manifest({ ...manifest, status: "frozen", frozenAt, manifestDigest: "0".repeat(64) }, { requireFrozen: true });
  if (errors.length) throw new Error(`Cannot freeze manifest: ${errors.join("; ")}`);
  const frozen = structuredClone(manifest);
  frozen.status = "frozen";
  frozen.frozenAt = frozenAt;
  frozen.frozenRevision = revision;
  delete frozen.manifestDigest;
  frozen.manifestDigest = digest(frozen);
  return frozen;
}

export function classifyManifestDrift(before, after) {
  const changed = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) if (canonicalize(before?.[key]) !== canonicalize(after?.[key])) changed.push(key);
  const completeResetKeys = new Set(["infrastructure", "windowPolicy", "slo", "workload", "telemetry", "evidenceSchemaVersion", "artifactStorage"]);
  const candidateResetKeys = new Set(["candidate", "baseline", "scenarios", "profiles", "temperatures", "arms", "confirmation"]);
  return {
    changed,
    invalidatesQualification: changed.some((key) => completeResetKeys.has(key)),
    invalidatesCandidateCaptures: changed.some((key) => candidateResetKeys.has(key)),
  };
}

export function assertResumeDigests(checkpoint, { manifestDigest, deploymentDigest, infrastructureDigest } = {}) {
  const failures = [];
  if (!checkpoint || checkpoint.manifestDigest !== manifestDigest) failures.push("manifest digest mismatch");
  if (!checkpoint || checkpoint.deploymentDigest !== deploymentDigest) failures.push("deployment digest mismatch");
  if (!checkpoint || checkpoint.infrastructureDigest !== infrastructureDigest) failures.push("infrastructure digest mismatch");
  if (failures.length) throw new Error(`Resume refused: ${failures.join("; ")}`);
  return true;
}
