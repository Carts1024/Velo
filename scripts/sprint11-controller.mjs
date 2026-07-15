import { createHash } from "node:crypto";

export const CONTROLLER_OPERATIONS = ["reset", "degrade", "recover", "replay", "backlog", "telemetry", "deployment", "rollback"];

export function createController({ manifestDigest, deploymentDigest, infrastructureDigest } = {}) {
  if (!manifestDigest || !deploymentDigest || !infrastructureDigest) throw new Error("controller digests are required");
  const state = { phase: "idle", manifestDigest, deploymentDigest, infrastructureDigest, events: [] };
  return {
    state,
    attest(operation, payload = {}) {
      if (!CONTROLLER_OPERATIONS.includes(operation)) throw new Error(`unsupported controller operation: ${operation}`);
      if (payload.manifestDigest !== manifestDigest || payload.deploymentDigest !== deploymentDigest || payload.infrastructureDigest !== infrastructureDigest) throw new Error("controller attestation digest mismatch");
      const event = { sequence: state.events.length + 1, operation, payload: structuredClone(payload), digest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), attestedAt: new Date().toISOString() };
      state.events.push(event);
      state.phase = operation === "rollback" ? "rolled-back" : operation === "recover" ? "recovered" : operation;
      return event;
    },
    checkpoint() { return { manifestDigest, deploymentDigest, infrastructureDigest, sequence: state.events.length, phase: state.phase }; },
  };
}
