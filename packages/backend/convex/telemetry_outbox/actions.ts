import { createTraceparent, traceIdentifiers } from "@repo/observability";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";

import { internalAction } from "../_generated/server";

const claimRef = makeFunctionReference<"mutation">("telemetry_outbox/mutations:claim");
const completeRef = makeFunctionReference<"mutation">("telemetry_outbox/mutations:complete");
const failRef = makeFunctionReference<"mutation">("telemetry_outbox/mutations:fail");
const MAX_EXPORT_BATCH = 50;

export type OutboxRow = {
  _id: Id<"telemetryOutbox">;
  kind: "span" | "metric";
  name: string;
  operation: string;
  stage: string;
  outcome: string;
  durationMs?: number;
  requestCorrelationId?: string;
  journeyCorrelationId?: string;
  traceparent?: string;
  value?: number;
  createdAt: number;
};

export function buildTracePayload(spans: OutboxRow[]) {
  return {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "velo-convex" } }] },
        scopeSpans: [
          {
            scope: { name: "@repo/observability" },
            spans: spans.map((row) => {
              const ids = traceIdentifiers(row.traceparent ?? createTraceparent());
              return {
                traceId: ids.traceId,
                spanId: ids.spanId,
                parentSpanId: ids.parentSpanId,
                name: row.name,
                kind: 1,
                startTimeUnixNano: String(BigInt(row.createdAt) * 1_000_000n),
                endTimeUnixNano: String(
                  BigInt(row.createdAt + Math.max(0, row.durationMs ?? 0)) * 1_000_000n,
                ),
                attributes: [
                  { key: "velo.operation", value: { stringValue: row.operation } },
                  { key: "velo.stage", value: { stringValue: row.stage } },
                  { key: "velo.outcome", value: { stringValue: row.outcome } },
                  ...(row.requestCorrelationId
                    ? [
                        {
                          key: "velo.requestCorrelationId",
                          value: { stringValue: row.requestCorrelationId },
                        },
                      ]
                    : []),
                  ...(row.journeyCorrelationId
                    ? [
                        {
                          key: "velo.journeyCorrelationId",
                          value: { stringValue: row.journeyCorrelationId },
                        },
                      ]
                    : []),
                ],
              };
            }),
          },
        ],
      },
    ],
  };
}

export function buildMetricPayload(metrics: OutboxRow[]) {
  return {
    resourceMetrics: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "velo-convex" } }] },
        scopeMetrics: [
          {
            scope: { name: "@repo/observability" },
            metrics: metrics.map((row) => {
              const value = row.value ?? 0;
              const attributes = [
                { key: "operation", value: { stringValue: row.operation } },
                { key: "stage", value: { stringValue: row.stage } },
                { key: "outcome", value: { stringValue: row.outcome } },
              ];
              if (row.name === "velo_journey_duration_seconds") {
                const explicitBounds = [0.05, 0.1, 0.25, 0.35, 0.5, 1, 1.5, 2, 3, 5, 8, 10, 30];
                const bucketCounts = Array.from({ length: explicitBounds.length + 1 }, () => "0");
                const bucket = explicitBounds.findIndex((bound) => value <= bound);
                bucketCounts[bucket === -1 ? explicitBounds.length : bucket] = "1";
                return {
                  name: row.name,
                  histogram: {
                    aggregationTemporality: 1,
                    dataPoints: [
                      {
                        count: "1",
                        sum: value,
                        explicitBounds,
                        bucketCounts,
                        timeUnixNano: String(BigInt(row.createdAt) * 1_000_000n),
                        attributes,
                      },
                    ],
                  },
                };
              }
              if (row.name.endsWith("_total")) {
                return {
                  name: row.name,
                  sum: {
                    aggregationTemporality: 1,
                    isMonotonic: true,
                    dataPoints: [
                      {
                        asDouble: value,
                        timeUnixNano: String(BigInt(row.createdAt) * 1_000_000n),
                        attributes,
                      },
                    ],
                  },
                };
              }
              return {
                name: row.name,
                gauge: {
                  dataPoints: [
                    {
                      asDouble: value,
                      timeUnixNano: String(BigInt(row.createdAt) * 1_000_000n),
                      attributes,
                    },
                  ],
                },
              };
            }),
          },
        ],
      },
    ],
  };
}

export const exportBatch = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const leaseToken = crypto.randomUUID();
    const rows = (await ctx.runMutation(claimRef, {
      leaseToken,
      limit: Math.min(args.limit ?? MAX_EXPORT_BATCH, MAX_EXPORT_BATCH),
    })) as OutboxRow[];
    if (rows.length === 0) return { exported: 0 };
    const endpoint = process.env.VELO_OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!endpoint) {
      await ctx.runMutation(failRef, { ids: rows.map((row) => row._id), leaseToken });
      return { exported: 0 };
    }
    try {
      const headers = {
        "content-type": "application/json",
        ...(process.env.VELO_OTEL_EXPORTER_OTLP_AUTHORIZATION
          ? { authorization: process.env.VELO_OTEL_EXPORTER_OTLP_AUTHORIZATION }
          : {}),
      };
      const spans = rows.filter((row) => row.kind === "span");
      const metrics = rows.filter((row) => row.kind === "metric");
      const requests: Promise<Response>[] = [];
      if (spans.length)
        requests.push(
          fetch(`${endpoint.replace(/\/$/, "")}/v1/traces`, {
            method: "POST",
            headers,
            body: JSON.stringify(buildTracePayload(spans)),
            signal: AbortSignal.timeout(5_000),
          }),
        );
      if (metrics.length)
        requests.push(
          fetch(`${endpoint.replace(/\/$/, "")}/v1/metrics`, {
            method: "POST",
            headers,
            body: JSON.stringify(buildMetricPayload(metrics)),
            signal: AbortSignal.timeout(5_000),
          }),
        );
      const responses = await Promise.all(requests);
      if (responses.some((response) => !response.ok)) throw new Error("export_failed");
      await ctx.runMutation(completeRef, { ids: rows.map((row) => row._id), leaseToken });
      return { exported: rows.length };
    } catch {
      await ctx.runMutation(failRef, { ids: rows.map((row) => row._id), leaseToken });
      return { exported: 0 };
    }
  },
});
