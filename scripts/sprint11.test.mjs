import test from "node:test";
import assert from "node:assert/strict";
import { loadSprint11Contract, freezeManifest, classifyManifestDrift, assertResumeDigests } from "./sprint11-contract.mjs";
import { evaluateSprint11, maximumSustainableThroughput, minimumWindowSustainableThroughput, validateCompetitorAdapter } from "./sprint11-gate-lib.mjs";

const { manifest } = await loadSprint11Contract();

test("Sprint 11 draft contract is versioned and exposes required arms", () => {
  assert.equal(manifest.manifestVersion, 4);
  assert.equal(manifest.evidenceSchemaVersion, 3);
  assert.ok(manifest.arms.includes("rollback"));
  assert.equal(manifest.scenarios.length, 7);
});

test("manifest freeze refuses dirty or unresolved revisions", () => {
  assert.throws(() => freezeManifest(manifest, { revision: "abc", gitStatus: [" M app.ts"] }), /dirty revision/);
  assert.throws(() => freezeManifest(manifest, { revision: "abc", gitStatus: [] }), /unresolved/);
});

test("drift differentiates candidate capture invalidation from full qualification reset", () => {
  assert.equal(classifyManifestDrift(manifest, { ...manifest, candidate: { revision: "new" } }).invalidatesCandidateCaptures, true);
  assert.equal(classifyManifestDrift(manifest, { ...manifest, slo: { ...manifest.slo, headroomFraction: 0.3 } }).invalidatesQualification, true);
});

test("canonical gate reports pending when live evidence is absent", async () => {
  const result = await evaluateSprint11({ manifestVersion: 4, evidenceSchemaVersion: 3, runs: [] }, { manifest });
  assert.equal(result.machineVerdict, "EVIDENCE_PENDING");
  assert.equal(result.approvalStatus, "PENDING");
  assert.ok(result.pending.includes("missing required qualification cell baseline/payment-intent-create/normal/normal/cold/morning"));
});

test("capacity helper uses only passing sustainable steps", () => {
  const result = maximumSustainableThroughput([{ pass: true, throughputRps: 10 }, { pass: false, throughputRps: 50 }, { pass: true, throughputRps: 20 }], manifest);
  assert.equal(result.sustainableRps, 20);
});

test("capacity qualification uses the lowest sustainable window", () => {
  const result = minimumWindowSustainableThroughput([
    { window: "morning", pass: true, throughputRps: 100 },
    { window: "afternoon", pass: true, throughputRps: 80 },
    { window: "evening", pass: true, throughputRps: 90 },
  ], manifest);
  assert.equal(result.sustainableRps, 80);
});

test("competitor adapter remains optional but strict when supplied", () => {
  assert.deepEqual(validateCompetitorAdapter(undefined), []);
  assert.ok(validateCompetitorAdapter({ name: "other" }).length > 0);
});

test("resume requires immutable manifest, deployment, and infrastructure digests", () => {
  assert.throws(() => assertResumeDigests({ manifestDigest: "a" }, { manifestDigest: "b", deploymentDigest: "d", infrastructureDigest: "i" }), /Resume refused/);
});
