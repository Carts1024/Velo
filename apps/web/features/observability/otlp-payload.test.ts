import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOtlpMetricPayload,
  buildOtlpTracePayload,
  shouldExportSpan,
} from "../../core/otlp.ts";

test("OTLP trace payload has valid IDs and duration", () => {
  const payload = buildOtlpTracePayload(
    {
      spanName: "velo.http.server",
      operation: "payment.create",
      stage: "mutation",
      outcome: "success",
      durationMs: 25,
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    },
    {
      enabled: true,
      endpoint: "http://collector:4318",
      serviceName: "test",
      releaseVersion: "1",
      successSampleRatio: 1,
    },
    1_000,
  );
  const span = payload.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  assert.match(span.traceId, /^(?!0{32})[0-9a-f]{32}$/);
  assert.equal(span.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");
  assert.equal(span.parentSpanId, "00f067aa0ba902b7");
  assert.match(span.spanId, /^(?!0{16})[0-9a-f]{16}$/);
  assert.equal(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano), 25_000_000n);
  const sibling = buildOtlpTracePayload({
    spanName: "velo.http.server",
    operation: "payment.create",
    stage: "mutation",
    outcome: "success",
    traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  }).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  assert.equal(sibling.traceId, span.traceId);
  assert.notEqual(sibling.spanId, span.spanId);
  const replay = buildOtlpTracePayload({
    spanName: "velo.http.server",
    operation: "payment.replay",
    stage: "mutation",
    outcome: "success",
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    linkedTraceparent: "00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01",
  }).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  assert.deepEqual(replay.links?.[0], {
    traceId: "cccccccccccccccccccccccccccccccc",
    spanId: "dddddddddddddddd",
    attributes: [],
  });
});

test("success sampling is deterministic while errors and timeouts always export", () => {
  const success = {
    spanName: "velo.http.server",
    operation: "test",
    stage: "mutation",
    outcome: "success",
    requestCorrelationId: "request-00000001",
  } as const;
  assert.equal(shouldExportSpan(success, 0.1), shouldExportSpan(success, 0.1));
  assert.equal(shouldExportSpan({ ...success, outcome: "error" }, 0), true);
  assert.equal(shouldExportSpan({ ...success, outcome: "timeout" }, 0), true);
  assert.equal(shouldExportSpan(success, 0), false);
  assert.equal(shouldExportSpan(success, 1), true);
});

test("stateless counter events use OTLP delta temporality and gauges stay gauges", () => {
  const counter = buildOtlpMetricPayload("velo_request_total", 1, { service: "web" });
  const sum = counter.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.sum;
  assert.equal(sum?.aggregationTemporality, 1);
  assert.equal(sum?.isMonotonic, true);
  const gauge = buildOtlpMetricPayload("velo_queue_depth", 3, { service: "backend" }, "gauge");
  assert.equal(
    gauge.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.gauge?.dataPoints[0]!.asDouble,
    3,
  );
  const histogram = buildOtlpMetricPayload(
    "velo_journey_duration_seconds",
    0.3,
    { operation: "payment-intent-create" },
    "histogram",
  );
  const point =
    histogram.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.histogram?.dataPoints[0]!;
  assert.equal(
    histogram.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.histogram?.aggregationTemporality,
    1,
  );
  assert.equal(point.count, "1");
  assert.equal(
    point.bucketCounts.reduce((sum, count) => sum + Number(count), 0),
    1,
  );
});
