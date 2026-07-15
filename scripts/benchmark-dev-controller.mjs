#!/usr/bin/env node

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { coldResetPayload } from "./benchmark/lifecycle.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4000;
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

const SCENARIOS = new Set([
  "payment-intent-create",
  "payment-intent-list",
  "checkout-preparation",
  "transaction-submission",
  "confirmation-detection",
  "ui-propagation",
  "webhook-delivery",
]);

const LIFECYCLE = {
  "checkout-preparation": {
    events: ["checkout.navigation_start", "checkout.ready"],
    metrics: [["checkout_preparation_ms", "checkout.navigation_start", "checkout.ready"]],
  },
  "transaction-submission": {
    events: [
      "wallet.interaction_start",
      "wallet.interaction_end",
      "stellar.submission_start",
      "stellar.submission_accepted",
      "velo.report_submitted",
    ],
    metrics: [
      ["wallet_interaction_ms", "wallet.interaction_start", "wallet.interaction_end"],
      ["stellar_submission_ms", "stellar.submission_start", "stellar.submission_accepted"],
      ["velo_report_submission_ms", "stellar.submission_accepted", "velo.report_submitted"],
      ["transaction_submission_ms", "wallet.interaction_start", "velo.report_submitted"],
    ],
  },
  "confirmation-detection": {
    events: ["stellar.submission_accepted", "stellar.finalized", "velo.observed", "velo.verified"],
    metrics: [
      ["stellar_finality_ms", "stellar.submission_accepted", "stellar.finalized"],
      ["velo_observation_ms", "stellar.finalized", "velo.observed"],
      ["velo_processing_ms", "velo.observed", "velo.verified"],
      ["confirmation_detection_ms", "stellar.submission_accepted", "velo.verified"],
    ],
  },
  "ui-propagation": {
    events: ["velo.verified", "ui.rendered"],
    metrics: [["ui_propagation_ms", "velo.verified", "ui.rendered"]],
  },
  "webhook-delivery": {
    events: [
      "velo.verified",
      "webhook.enqueued",
      "webhook.attempt_started",
      "merchant.acknowledged",
    ],
    metrics: [
      ["webhook_enqueue_ms", "velo.verified", "webhook.enqueued"],
      ["webhook_queue_ms", "webhook.enqueued", "webhook.attempt_started"],
      ["merchant_response_ms", "webhook.attempt_started", "merchant.acknowledged"],
      ["webhook_delivery_ms", "velo.verified", "merchant.acknowledged"],
    ],
  },
};

export function createDevControllerServer(options = {}) {
  const config = createConfig(options);
  const state = {
    fixtures: new Map(),
    nonces: new Map(),
  };
  const server = createServer((request, response) => {
    handleRequest(request, response, config, state).catch((error) => {
      writeJson(response, 500, { error: "development_controller_error", message: error.message });
    });
  });
  return { server, state, config };
}

export async function startDevController(options = {}) {
  const controller = createDevControllerServer(options);
  const host = controller.config.host;
  const port = controller.config.port;
  await new Promise((resolve, reject) => {
    controller.server.once("error", reject);
    controller.server.listen(port, host, resolve);
  });
  const address = controller.server.address();
  return {
    ...controller,
    address,
    url: `http://${address.address}:${address.port}`,
  };
}

async function handleRequest(request, response, config, state) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return writeJson(response, 200, {
      status: "ok",
      developmentOnly: true,
      controller: "benchmark-dev-controller",
    });
  }

  const authError = await authenticate(request, url, config, state);
  if (authError) return writeJson(response, authError.status, { error: authError.message });

  let body;
  try {
    body = JSON.parse((await readBody(request)) || "{}");
  } catch {
    return writeJson(response, 400, { error: "request body must be valid JSON" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return writeJson(response, 400, { error: "request body must be a JSON object" });
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || !SCENARIOS.has(parts[0])) {
    return writeJson(response, 404, { error: "unknown benchmark controller route" });
  }
  const [scenario, operation] = parts;
  if (operation === "setup" && request.method === "POST") {
    return writeJson(response, 200, setupFixture(body, scenario, config, state));
  }

  const fixture = state.fixtures.get(body.fixtureId);
  const fixtureError = validateFixture(fixture, body, scenario, config);
  if (fixtureError)
    return writeJson(response, fixtureError.status, { error: fixtureError.message });

  if (operation === "prime" && request.method === "POST") {
    fixture.primed = true;
    return writeJson(response, 200, {
      primed: true,
      evidenceMode: "real",
      developmentOnly: true,
    });
  }
  if (operation === "execute" && request.method === "POST") {
    return writeJson(response, 200, buildControlSample(body, scenario, fixture, config));
  }
  if (operation === "reset" && request.method === "POST") {
    return writeJson(response, 200, {
      coldResetEvidence: buildColdResetEvidence(body, config),
      developmentOnly: true,
    });
  }
  if (operation === "cleanup" && request.method === "DELETE") {
    state.fixtures.delete(body.fixtureId);
    return writeJson(response, 200, {
      cleaned: true,
      captureId: body.captureId,
      cohortId: body.cohortId,
      receiptId: `dev-cleanup-${randomUUID()}`,
      cleanedAt: new Date().toISOString(),
      developmentOnly: true,
    });
  }
  return writeJson(response, 405, { error: "unsupported benchmark controller operation" });
}

function createConfig(options) {
  const host = options.host ?? process.env.VELO_BENCHMARK_DEV_CONTROLLER_HOST ?? DEFAULT_HOST;
  if (!isLoopback(host)) throw new Error("development controller must bind to loopback");
  if (process.env.NODE_ENV === "production") {
    throw new Error("development controller cannot run with NODE_ENV=production");
  }
  return {
    host,
    port: Number(options.port ?? process.env.VELO_BENCHMARK_DEV_CONTROLLER_PORT ?? DEFAULT_PORT),
    token: options.token ?? process.env.VELO_BENCHMARK_CONTROL_TOKEN ?? "local-token",
    secret: options.secret ?? process.env.VELO_BENCHMARK_CONTROL_SECRET ?? "local-secret",
    authorizationId:
      options.authorizationId ?? process.env.VELO_BENCHMARK_AUTHORIZATION_ID ?? "local-development",
  };
}

async function authenticate(request, url, config, state) {
  const headers = request.headers;
  const body = await readBody(request, { peek: true });
  const timestamp = headers["x-velo-benchmark-timestamp"];
  const nonce = headers["x-velo-benchmark-nonce"];
  const captureId = headers["x-velo-benchmark-capture-id"];
  const authorizationId = headers["x-velo-benchmark-authorization-id"];
  const contentSha256 = headers["x-velo-benchmark-content-sha256"];
  const signature = headers["x-velo-benchmark-signature"];
  if (headers.authorization !== `Bearer ${config.token}`) {
    return { status: 401, message: "invalid benchmark controller token" };
  }
  if (authorizationId !== config.authorizationId) {
    return { status: 403, message: "benchmark authorization ID mismatch" };
  }
  if (!timestamp || !nonce || !captureId || !contentSha256 || !signature) {
    return { status: 400, message: "benchmark authentication headers are incomplete" };
  }
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_TIMESTAMP_SKEW_MS) {
    return { status: 401, message: "benchmark request timestamp is outside the allowed window" };
  }
  if (state.nonces.has(nonce))
    return { status: 401, message: "benchmark request nonce was reused" };
  const actualBodySha256 = createHash("sha256").update(body).digest("hex");
  if (contentSha256 !== actualBodySha256) {
    return { status: 400, message: "benchmark request body digest mismatch" };
  }
  const canonical = [
    request.method,
    url.pathname,
    timestamp,
    nonce,
    contentSha256,
    captureId,
    authorizationId,
  ].join("\n");
  const expected = createHmac("sha256", config.secret).update(canonical).digest("hex");
  if (!safeEqualHex(signature, expected))
    return { status: 401, message: "benchmark request signature mismatch" };
  state.nonces.set(nonce, Date.now());
  for (const [key, value] of state.nonces)
    if (Date.now() - value > MAX_TIMESTAMP_SKEW_MS) state.nonces.delete(key);
  return null;
}

async function readBody(request, { peek = false } = {}) {
  if (peek && request.__body !== undefined) return request.__body;
  if (request.__body === undefined) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    request.__body = Buffer.concat(chunks).toString("utf8");
  }
  return request.__body;
}

function setupFixture(body, scenario, config, state) {
  const fixtureId = `dev-fixture-${randomUUID()}`;
  const fixture = {
    fixtureId,
    cleanupToken: `dev-cleanup-${randomUUID()}`,
    captureId: body.captureId,
    cohortId: body.cohortId,
    runId: body.runId,
    scenario,
    profile: body.profile,
    temperature: body.temperature,
    window: body.window,
    primed: false,
  };
  state.fixtures.set(fixtureId, fixture);
  return {
    authorized: true,
    authorizationId: config.authorizationId,
    evidenceMode: "real",
    developmentOnly: true,
    cohortId: fixture.cohortId,
    temperatureApplied: fixture.temperature,
    profileApplied: fixture.profile,
    fixtureId,
    cleanupToken: fixture.cleanupToken,
    setupReceiptId: `dev-setup-${randomUUID()}`,
    clockProvenance: clockProvenance(),
  };
}

function validateFixture(fixture, body, scenario, config) {
  if (!fixture) return { status: 404, message: "benchmark fixture was not found" };
  if (
    fixture.scenario !== scenario ||
    fixture.captureId !== body.captureId ||
    fixture.cohortId !== body.cohortId
  ) {
    return { status: 409, message: "benchmark fixture scope mismatch" };
  }
  if (body.cleanupToken && body.cleanupToken !== fixture.cleanupToken) {
    return { status: 403, message: "benchmark fixture cleanup token mismatch" };
  }
  if (config.authorizationId.length === 0)
    return { status: 500, message: "controller authorization is not configured" };
  return null;
}

function buildControlSample(body, scenario, fixture, config) {
  const definition = LIFECYCLE[scenario];
  const now = Date.now();
  const events = definition ? definition.events : [];
  const eventTimes = new Map(events.map((name, index) => [name, now + index * 5]));
  const lifecycle = events.map((name) => ({
    name,
    epochMs: eventTimes.get(name),
    source: "development-controller",
    clockDomain: "control-wall",
    provenanceId: "control-wall",
  }));
  const metrics = (definition?.metrics ?? []).map(([name, startEvent, endEvent]) => ({
    name,
    unit: "ms",
    startEvent,
    endEvent,
    durationMs: eventTimes.get(endEvent) - eventTimes.get(startEvent),
  }));
  const sample = {
    sample: body.sample,
    captureId: body.captureId,
    cohortId: body.cohortId,
    status: "success",
    evidenceMode: "real",
    developmentOnly: true,
    correlationId: `dev-correlation-${body.runId}-${body.sample}`,
    lifecycle,
    metrics,
    dependencyTimings: [],
    queueDepth: 0,
    eventLagMs: 0,
  };
  if (body.temperature === "cold") sample.coldResetEvidence = buildColdResetEvidence(body, config);
  return sample;
}

function buildColdResetEvidence(body, config) {
  const evidence = {
    applied: true,
    resetId: `dev-reset-${randomUUID()}`,
    method: "development-controller-reset",
    authorizationId: config.authorizationId,
    captureId: body.captureId,
    cohortId: body.cohortId,
    sample: body.sample,
    resetAtEpochMs: Date.now(),
  };
  const payload = coldResetPayload(evidence);
  return {
    ...evidence,
    attestation: {
      algorithm: "hmac-sha256",
      payloadSha256: createHash("sha256").update(payload).digest("hex"),
      signature: createHmac("sha256", config.secret).update(payload).digest("hex"),
      verified: true,
    },
  };
}

function clockProvenance() {
  return [
    {
      id: "control-wall",
      source: "development-controller",
      kind: "wall",
      unit: "ms",
      synchronization: "same-process",
      resolutionMs: 1,
    },
  ];
}

function safeEqualHex(actual, expected) {
  if (!/^[a-f0-9]+$/i.test(actual) || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function isLoopback(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function writeJson(response, status, body) {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "application/json" });
  response.end(`${JSON.stringify(body)}\n`);
}

async function main() {
  loadEnvironment();
  if (process.argv.includes("--help")) {
    console.log("Usage: pnpm benchmark:controller:dev");
    return;
  }
  const controller = await startDevController();
  console.log(`Development-only benchmark controller listening on ${controller.url}`);
  console.log(`Authorization ID: ${controller.config.authorizationId}`);
  console.log(
    "Synthetic controller evidence must never be used for qualification or release claims.",
  );
  const shutdown = () => controller.server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function loadEnvironment() {
  for (const file of [".env", ".env.local", ".env.benchmark"]) {
    if (!existsSync(resolve(file)) || typeof process.loadEnvFile !== "function") continue;
    try {
      process.loadEnvFile(resolve(file));
    } catch {}
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
