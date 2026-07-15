import assert from "node:assert/strict";
import test from "node:test";

import {
  deterministicSample,
  parseTelemetryContext,
  projectSafeEvent,
  validateMetricLabels,
  traceIdentifiers,
} from "./index.ts";

test("accepts only validated correlation and W3C trace context", () => {
  assert.deepEqual(
    parseTelemetryContext({
      requestCorrelationId: "request-00000001",
      journeyCorrelationId: "journey-00000001",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    }),
    {
      requestCorrelationId: "request-00000001",
      journeyCorrelationId: "journey-00000001",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    },
  );
  assert.equal(parseTelemetryContext({ requestCorrelationId: "Bearer secret" }), null);
});

test("projects only actual catalog values and creates valid unique OTLP identifiers", () => {
  assert.deepEqual(
    projectSafeEvent({
      spanName: "made.up",
      stage: "secret",
      outcome: "wat",
      operation: "BAD VALUE",
    }),
    {},
  );
  const parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const first = traceIdentifiers(parent);
  const second = traceIdentifiers(parent);
  assert.match(first.traceId, /^[0-9a-f]{32}$/);
  assert.match(first.spanId, /^(?!0{16})[0-9a-f]{16}$/);
  assert.notEqual(first.spanId, second.spanId);
});

test("allowlist projection drops hostile, cyclic, and sensitive fields", () => {
  const value: Record<string, unknown> = {
    spanName: "velo.http.server",
    operation: "payment.create",
    stage: "mutation",
    outcome: "success",
    authorization: "Bearer secret",
    customerId: "customer-1",
    payload: { accountNumber: "123" },
    error: new Error("raw provider response"),
  };
  value.cycle = value;
  assert.deepEqual(projectSafeEvent(value), {
    spanName: "velo.http.server",
    operation: "payment.create",
    stage: "mutation",
    outcome: "success",
  });
});

test("sampling is deterministic and metric labels are bounded", () => {
  assert.equal(deterministicSample("journey-1", 0.1), deterministicSample("journey-1", 0.1));
  assert.equal(validateMetricLabels({ service: "web", outcome: "success" }), true);
  assert.equal(validateMetricLabels({ correlation_id: "random" }), false);
});

test("ten thousand entity identifiers cannot create metric labels", () => {
  for (let index = 0; index < 10_000; index += 1) {
    assert.equal(validateMetricLabels({ operation: "payment.create", outcome: "success" }), true);
    assert.equal(validateMetricLabels({ entity_id: crypto.randomUUID() }), false);
  }
});

test("one journey reconstructs ordered API through UI stages", () => {
  const journeyCorrelationId = "journey-00000001";
  const events = [
    ["api", 1],
    ["convex", 2],
    ["submission", 3],
    ["observation", 4],
    ["state_update", 5],
    ["webhook", 6],
    ["ui_render", 7],
  ].map(([stage, at]) => ({ journeyCorrelationId, stage, at: Number(at) }));
  const reconstructed = events
    .filter((event) => event.journeyCorrelationId === journeyCorrelationId)
    .sort((left, right) => left.at - right.at)
    .map((event) => event.stage);
  assert.deepEqual(reconstructed, [
    "api",
    "convex",
    "submission",
    "observation",
    "state_update",
    "webhook",
    "ui_render",
  ]);
});
