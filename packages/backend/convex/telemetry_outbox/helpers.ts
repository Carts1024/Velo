import { deterministicSample } from "@repo/observability";

import type { MutationCtx } from "../_generated/server";
import type {
  MetricName,
  SpanName,
  TelemetryErrorCode,
  TelemetryOutcome,
  TelemetryStage,
} from "@repo/observability";

import { isConvexTelemetryEnabled } from "./config";

const RETENTION_MS = 14 * 24 * 60 * 60 * 1_000;

export async function recordMetric(
  ctx: MutationCtx,
  name: MetricName,
  operation: string,
  stage: TelemetryStage,
  outcome: TelemetryOutcome,
  value = 1,
) {
  if (!isConvexTelemetryEnabled()) return null;
  const now = Date.now();
  return await ctx.db.insert("telemetryOutbox", {
    kind: "metric",
    name,
    operation,
    stage,
    outcome,
    value,
    state: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    leaseGeneration: 0,
    expiresAt: now + RETENTION_MS,
    createdAt: now,
  });
}

export async function recordSpan(
  ctx: MutationCtx,
  name: SpanName,
  operation: string,
  stage: TelemetryStage,
  outcome: TelemetryOutcome,
  options: {
    requestCorrelationId?: string;
    journeyCorrelationId?: string;
    traceparent?: string;
    errorCode?: TelemetryErrorCode;
    durationMs?: number;
  } = {},
) {
  if (!isConvexTelemetryEnabled()) return null;
  if (outcome === "success") {
    const samplingKey = options.journeyCorrelationId ?? options.requestCorrelationId;
    if (!samplingKey || !deterministicSample(samplingKey, 0.1)) return null;
  }
  const { durationMs, ...context } = options;
  const now = Date.now();
  return await ctx.db.insert("telemetryOutbox", {
    kind: "span",
    name,
    operation,
    stage,
    outcome,
    ...context,
    ...(durationMs !== undefined ? { durationMs: Math.max(0, durationMs) } : {}),
    state: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    leaseGeneration: 0,
    expiresAt: now + RETENTION_MS,
    createdAt: now,
  });
}
