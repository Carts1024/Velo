import assert from "node:assert/strict";
import test from "node:test";

import {
  completeRequestTelemetry,
  correlationIdFromRequest,
  redactTelemetry,
  startRequestTelemetry,
} from "../../core/observability.ts";

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
});

test("redacts credentials, signatures, private data, and payloads from telemetry", () => {
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
    {
      apiKey: "[REDACTED]",
      authorization: "[REDACTED]",
      signature: "[REDACTED]",
      signedXdr: "[REDACTED]",
      payload: "[REDACTED]",
      walletSeed: "[REDACTED]",
      wallet: { seed: "[REDACTED]" },
      mnemonic: "[REDACTED]",
      passphrase: "[REDACTED]",
      correlationId: "pay-2026-0003",
    },
  );
});
