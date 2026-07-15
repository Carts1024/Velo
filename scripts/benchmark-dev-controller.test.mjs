import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import test from "node:test";

import { startDevController } from "./benchmark-dev-controller.mjs";
import { createScenarioAdapter } from "./benchmark/adapters.mjs";
import { coldResetPayload } from "./benchmark/lifecycle.mjs";

test("development controller authenticates setup, execute, cold reset, and cleanup", async (t) => {
  const controller = await startDevController({
    port: 0,
    token: "test-token",
    secret: "test-secret",
    authorizationId: "test-authorization",
  });
  t.after(() => controller.server.close());
  const context = {
    captureId: "capture-1",
    cohortId: "cohort-1",
    runId: "run-1",
    scenario: "checkout-preparation",
    profile: "normal",
    temperature: "cold",
    window: "morning",
    sample: 0,
  };

  const setup = await request(controller.url, "/checkout-preparation/setup", {
    token: "test-token",
    secret: "test-secret",
    authorizationId: "test-authorization",
    captureId: context.captureId,
    body: { ...context, evidenceMode: "real" },
  });
  assert.equal(setup.status, 200);
  const fixture = setup.body;
  assert.equal(fixture.authorized, true);
  assert.equal(fixture.developmentOnly, true);
  assert.equal(fixture.temperatureApplied, "cold");

  const execute = await request(controller.url, "/checkout-preparation/execute", {
    method: "POST",
    token: "test-token",
    secret: "test-secret",
    authorizationId: "test-authorization",
    captureId: context.captureId,
    body: { ...context, fixtureId: fixture.fixtureId, evidenceMode: "real" },
  });
  assert.equal(execute.status, 200);
  assert.equal(execute.body.status, "success");
  assert.equal(execute.body.coldResetEvidence.attestation.algorithm, "hmac-sha256");
  assert.equal(execute.body.lifecycle.length, 2);
  assert.equal(execute.body.metrics[0].name, "checkout_preparation_ms");

  const expectedPayload = coldResetPayload(execute.body.coldResetEvidence);
  assert.equal(
    execute.body.coldResetEvidence.attestation.signature,
    createHmac("sha256", "test-secret").update(expectedPayload).digest("hex"),
  );

  const cleanup = await request(controller.url, "/checkout-preparation/cleanup", {
    method: "DELETE",
    token: "test-token",
    secret: "test-secret",
    authorizationId: "test-authorization",
    captureId: context.captureId,
    body: {
      captureId: context.captureId,
      cohortId: context.cohortId,
      fixtureId: fixture.fixtureId,
      cleanupToken: fixture.cleanupToken,
    },
  });
  assert.equal(cleanup.status, 200);
  assert.equal(cleanup.body.cleaned, true);
});

test("development controller rejects bad signatures and reused nonces", async (t) => {
  const controller = await startDevController({
    port: 0,
    token: "token",
    secret: "secret",
    authorizationId: "auth",
  });
  t.after(() => controller.server.close());
  const options = {
    token: "token",
    secret: "secret",
    authorizationId: "auth",
    captureId: "capture-1",
    body: {
      captureId: "capture-1",
      cohortId: "cohort-1",
      runId: "run-1",
      scenario: "checkout-preparation",
      profile: "normal",
      temperature: "warm",
      window: "morning",
    },
  };
  const first = await request(controller.url, "/checkout-preparation/setup", options);
  assert.equal(first.status, 200);
  const reused = await request(controller.url, "/checkout-preparation/setup", {
    ...options,
    nonce: first.nonce,
  });
  assert.equal(reused.status, 401);
  const invalid = await request(controller.url, "/checkout-preparation/setup", {
    ...options,
    secret: "wrong-secret",
  });
  assert.equal(invalid.status, 401);
});

test("development controller satisfies the benchmark control adapter contract", async (t) => {
  const controller = await startDevController({
    port: 0,
    token: "adapter-token",
    secret: "adapter-secret",
    authorizationId: "adapter-auth",
  });
  t.after(() => controller.server.close());
  const env = {
    VELO_BENCHMARK_CONTROL_URL: controller.url,
    VELO_BENCHMARK_CONTROL_TOKEN: "adapter-token",
    VELO_BENCHMARK_CONTROL_SECRET: "adapter-secret",
    VELO_BENCHMARK_AUTHORIZATION_ID: "adapter-auth",
    VELO_BENCHMARK_ALLOW_INSECURE_LOCALHOST: "1",
  };
  const scenario = {
    id: "checkout-preparation",
    adapter: "control",
    controlPath: "/checkout-preparation",
    requiredEnv: Object.keys(env).filter(
      (name) => name !== "VELO_BENCHMARK_ALLOW_INSECURE_LOCALHOST",
    ),
    requiredEvents: ["checkout.navigation_start", "checkout.ready"],
    requiredMetrics: ["checkout_preparation_ms"],
  };
  const adapter = createScenarioAdapter(scenario, { env });
  const context = {
    captureId: "adapter-capture",
    cohortId: "adapter-cohort",
    runId: "adapter-run",
    scenario: scenario.id,
    profile: "normal",
    temperature: "cold",
    window: "morning",
    sample: 0,
    targetSamples: 1,
    timeoutMs: 1000,
  };
  const fixture = await adapter.setup(context);
  const sample = await adapter.execute(fixture, context);
  assert.equal(sample.status, "success");
  assert.equal(sample.coldResetEvidence.attestation.verified, true);
  const cleanup = await adapter.cleanup(fixture, context);
  assert.equal(cleanup.controlled, true);
  assert.equal(cleanup.captureId, context.captureId);
  assert.equal(cleanup.cohortId, context.cohortId);
  assert.match(cleanup.receiptId, /^dev-cleanup-/);
  assert.ok(cleanup.cleanedAt);
});

async function request(base, path, options) {
  const method = options.method ?? "POST";
  const rawBody = JSON.stringify(options.body ?? {});
  const timestamp = String(Date.now());
  const nonce = options.nonce ?? randomUUID();
  const bodySha256 = createHash("sha256").update(rawBody).digest("hex");
  const canonical = [
    method,
    path,
    timestamp,
    nonce,
    bodySha256,
    options.captureId,
    options.authorizationId,
  ].join("\n");
  const signature = createHmac("sha256", options.secret).update(canonical).digest("hex");
  const response = await fetch(`${base}${path}`, {
    method,
    body: rawBody,
    headers: {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
      "x-velo-benchmark-authorization-id": options.authorizationId,
      "x-velo-benchmark-capture-id": options.captureId,
      "x-velo-benchmark-timestamp": timestamp,
      "x-velo-benchmark-nonce": nonce,
      "x-velo-benchmark-content-sha256": bodySha256,
      "x-velo-benchmark-signature": signature,
    },
  });
  return { status: response.status, body: await response.json(), nonce };
}
