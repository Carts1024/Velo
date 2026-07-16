import assert from "node:assert/strict";
import test from "node:test";

import {
  completeRequestTelemetry,
  correlationIdFromRequest,
  redactTelemetry,
  startRequestTelemetry,
  type RouteTelemetry,
} from "../../core/observability.ts";
import { setOtlpPayloadObserverForTests } from "../../core/otlp.ts";

test("accepts a safe correlation ID and rejects unsafe reflected values", () => {
  assert.equal(
    correlationIdFromRequest({ headers: new Headers({ "x-correlation-id": "pay-2026-0001" }) }),
    "pay-2026-0001",
  );
  assert.notEqual(
    correlationIdFromRequest({
      headers: new Headers({ "x-correlation-id": "Bearer tk_live_deadbeef" }),
    }),
    "Bearer tk_live_deadbeef",
  );
});

test("adds correlation and safe Server-Timing fields", () => {
  const telemetry = startRequestTelemetry(
    { headers: new Headers({ "x-correlation-id": "pay-2026-0002" }) },
    "payment_intent.create",
  );
  telemetry.stages.push({ name: "convex.action", durationMs: 12.345 });

  const response = completeRequestTelemetry(telemetry, new Response("ok"));
  assert.equal(response.headers.get("x-correlation-id"), "pay-2026-0002");
  assert.match(response.headers.get("server-timing") ?? "", /velo_total;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /convex\.action;dur=12\.35/);
  assert.equal(response.headers.get("x-velo-server-timing"), response.headers.get("server-timing"));
});

test("route completion exports the inbound trace and replay link", () => {
  type CapturedSpan = {
    traceId: string;
    parentSpanId: string;
    links: Array<{ traceId: string; spanId: string; attributes: unknown[] }>;
  };
  let capturedSpan: CapturedSpan | undefined;
  setOtlpPayloadObserverForTests((value) => {
    const payload = value as {
      resourceSpans: Array<{ scopeSpans: Array<{ spans: CapturedSpan[] }> }>;
    };
    capturedSpan = payload.resourceSpans[0]?.scopeSpans[0]?.spans[0];
  });
  try {
    const routeTelemetry: RouteTelemetry = {
      correlationId: "request-00000001",
      operation: "payment_intent.create.v2",
      startedAt: performance.now(),
      stages: [],
      context: {
        requestCorrelationId: "request-00000001",
        traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
      },
      linkTraceparent: "00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01",
      addStage() {},
    };
    completeRequestTelemetry(routeTelemetry, new Response("ok"));
    assert.equal(capturedSpan?.traceId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(capturedSpan?.parentSpanId, "bbbbbbbbbbbbbbbb");
    assert.deepEqual(capturedSpan?.links[0], {
      traceId: "cccccccccccccccccccccccccccccccc",
      spanId: "dddddddddddddddd",
      attributes: [],
    });
  } finally {
    setOtlpPayloadObserverForTests();
  }
});

test("allowlist drops credentials, signatures, private data, payloads, and unknown fields", () => {
  assert.deepEqual(
    redactTelemetry({
      apiKey: "tk_live_secret",
      authorization: "Bearer token",
      signature: "abc",
      signedXdr: "AAAA",
      payload: { walletPrivateData: "never log" },
      walletSeed: "SABC123",
      wallet: { seed: "SDEF456" },
      mnemonic: "twelve private words",
      passphrase: "wallet password",
      correlationId: "pay-2026-0003",
    }),
    {},
  );
});

test("allowlist retains only the closed safe event contract", () => {
  assert.deepEqual(
    redactTelemetry({
      spanName: "velo.http.server",
      operation: "payment.create",
      stage: "mutation",
      outcome: "success",
      requestCorrelationId: "pay-2026-0003",
      arbitrary: "drop me",
    }),
    {
      spanName: "velo.http.server",
      operation: "payment.create",
      stage: "mutation",
      outcome: "success",
      requestCorrelationId: "pay-2026-0003",
    },
  );
});
