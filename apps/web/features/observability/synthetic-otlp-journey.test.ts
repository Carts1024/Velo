import assert from "node:assert/strict";
import test from "node:test";

import { buildOtlpTracePayload } from "../../core/otlp.ts";

const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const journeyCorrelationId = "journey-00000001";

type TracePayload = ReturnType<typeof buildOtlpTracePayload>;

function receive(payloads: TracePayload[]) {
  return payloads.flatMap((payload) =>
    payload.resourceSpans.flatMap((resource) =>
      resource.scopeSpans.flatMap((scope) => scope.spans),
    ),
  );
}

function attribute(
  span: { attributes: Array<{ key: string; value: { stringValue?: string } }> },
  key: string,
) {
  return span.attributes.find((entry) => entry.key === key)?.value.stringValue;
}

test("in-memory OTLP receiver reconstructs one complete correlated journey", () => {
  const config = {
    enabled: true,
    endpoint: "http://collector:4318",
    serviceName: "test",
    releaseVersion: "1",
    successSampleRatio: 1,
  };
  const webEvent = (operation: string, endMs: number) =>
    buildOtlpTracePayload(
      {
        spanName: operation === "ui_render" ? "velo.ui.render" : "velo.http.server",
        operation,
        stage: operation === "ui_render" ? "ui_render" : "mutation",
        outcome: "success",
        requestCorrelationId: "request-00000001",
        journeyCorrelationId,
        traceparent,
      },
      config,
      endMs,
    );
  const backendStages = [
    ["convex", "mutation", "velo.convex.operation"],
    ["submission", "submission", "velo.dependency.call"],
    ["provider", "provider_call", "velo.dependency.call"],
    ["ledger_observation", "observation", "velo.worker.run"],
    ["state_update", "state_update", "velo.convex.operation"],
    ["webhook_acknowledgement", "webhook_network", "velo.dependency.call"],
  ] as const;
  const backendEvents = backendStages.map(([operation, stage, spanName], index) =>
    buildOtlpTracePayload(
      {
        spanName: spanName as "velo.convex.operation" | "velo.dependency.call" | "velo.worker.run",
        operation,
        stage: stage as
          | "mutation"
          | "submission"
          | "provider_call"
          | "observation"
          | "state_update"
          | "webhook_network",
        outcome: "success",
        journeyCorrelationId,
        traceparent,
      },
      { ...config, serviceName: "velo-convex" },
      2_000 + index,
    ),
  );

  const spans = receive([webEvent("api", 1_000), ...backendEvents, webEvent("ui_render", 3_000)]);
  const reconstructed = spans
    .filter(
      (span) =>
        span.traceId === "4bf92f3577b34da6a3ce929d0e0e4736" &&
        attribute(span, "velo.journeyCorrelationId") === journeyCorrelationId,
    )
    .sort((left, right) => Number(BigInt(left.startTimeUnixNano) - BigInt(right.startTimeUnixNano)))
    .map((span) => attribute(span, "velo.operation"));

  assert.deepEqual(reconstructed, [
    "api",
    "convex",
    "submission",
    "provider",
    "ledger_observation",
    "state_update",
    "webhook_acknowledgement",
    "ui_render",
  ]);
});
