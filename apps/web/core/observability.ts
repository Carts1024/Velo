import {
  createTraceparent,
  isCorrelationId,
  isTraceparent,
  normalizeErrorCode,
  projectSafeEvent,
  type TelemetryContext,
  type TelemetryStage as StandardTelemetryStage,
} from "@repo/observability";

import { exportSafeLog, exportSafeMetric, exportSafeSpan } from "./otlp.ts";

const MAX_SERVER_TIMING_ENTRIES = 12;

export type TelemetryStage = {
  name: string;
  durationMs: number;
};

export type RequestTelemetry = {
  correlationId: string;
  operation: string;
  startedAt: number;
  stages: TelemetryStage[];
  context?: TelemetryContext;
};

/**
 * Uses an inbound correlation ID only when it is safe to echo into logs and headers.
 * This avoids accidentally reflecting API keys, signatures, or arbitrary payloads.
 */
export function correlationIdFromRequest(request: { headers: Headers }): string {
  const supplied = request.headers.get("x-correlation-id")?.trim();
  if (isCorrelationId(supplied)) {
    return supplied;
  }
  return crypto.randomUUID();
}

export function startRequestTelemetry(
  request: { headers: Headers },
  operation: string,
): RequestTelemetry {
  return {
    correlationId: correlationIdFromRequest(request),
    operation,
    startedAt: now(),
    stages: [],
  };
}

export function telemetryContextFromRequest(request: { headers: Headers }): TelemetryContext {
  const requestCorrelationId = correlationIdFromRequest(request);
  const journey = request.headers.get("x-velo-journey-id")?.trim();
  const traceparent = request.headers.get("traceparent")?.trim();
  return {
    requestCorrelationId,
    ...(isCorrelationId(journey) ? { journeyCorrelationId: journey } : {}),
    traceparent: isTraceparent(traceparent) ? traceparent : createTraceparent(),
  };
}

export async function measureTelemetryStage<T>(
  telemetry: RequestTelemetry,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = now();
  try {
    return await operation();
  } finally {
    telemetry.stages.push({ name: safeTimingName(name), durationMs: now() - startedAt });
  }
}

/** Adds public-safe correlation and aggregate timing headers to a route response. */
export function completeRequestTelemetry<T extends Response>(
  telemetry: RequestTelemetry,
  response: T,
): T {
  const totalMs = now() - telemetry.startedAt;
  const entries = [
    `velo_total;dur=${formatDuration(totalMs)}`,
    ...telemetry.stages
      .slice(0, MAX_SERVER_TIMING_ENTRIES)
      .map((stage) => `${stage.name};dur=${formatDuration(stage.durationMs)}`),
  ];

  const serverTiming = entries.join(", ");
  response.headers.set("X-Correlation-Id", telemetry.correlationId);
  response.headers.set("X-Request-Id", telemetry.correlationId);
  response.headers.set("Server-Timing", serverTiming);
  // Some deployment proxies remove the standards-based header. Keep it for
  // compatible runtimes and mirror the same value for deployed probes.
  response.headers.set("X-Velo-Server-Timing", serverTiming);
  emitTelemetry({
    spanName: "velo.http.server",
    correlationId: telemetry.correlationId,
    requestCorrelationId: telemetry.correlationId,
    traceparent: telemetry.context?.traceparent,
    linkedTraceparent:
      "linkTraceparent" in telemetry ? (telemetry as RouteTelemetry).linkTraceparent : undefined,
    operation: telemetry.operation,
    stage: telemetry.stages.at(-1)?.name ?? "mutation",
    outcome: response.ok ? "success" : "error",
    totalMs: Math.round(totalMs * 100) / 100,
    stages: telemetry.stages,
  });
  exportSafeSpan({
    spanName: "velo.http.server",
    operation: telemetry.operation,
    stage: "mutation",
    outcome: response.ok ? "success" : "error",
    durationMs: totalMs,
    requestCorrelationId: telemetry.correlationId,
    journeyCorrelationId: telemetry.context?.journeyCorrelationId,
    traceparent: telemetry.context?.traceparent,
    linkedTraceparent:
      "linkTraceparent" in telemetry ? (telemetry as RouteTelemetry).linkTraceparent : undefined,
  });
  const labels = {
    service: "web",
    operation: telemetry.operation,
    outcome: response.ok ? "success" : "error",
  };
  exportSafeMetric("velo_request_total", 1, labels);
  exportSafeMetric(response.ok ? "velo_success_total" : "velo_error_total", 1, labels);
  if (response.ok) exportSafeMetric("velo_correlation_return_total", 1, labels);
  const scenario = scenarioForOperation(telemetry.operation);
  if (response.ok && scenario) {
    exportSafeMetric(
      "velo_journey_duration_seconds",
      totalMs / 1_000,
      {
        service: "web",
        operation: scenario,
        outcome: "success",
      },
      "histogram",
    );
  }
  return response;
}

function scenarioForOperation(operation: string) {
  if (operation.startsWith("payment_intent.create")) return "payment-intent-create";
  if (operation.startsWith("payment_intent.list")) return "payment-intent-list";
  return undefined;
}

/**
 * Structured telemetry is deliberately redacted before it reaches logs. This is
 * also the single place route and worker instrumentation should use for events.
 */
export function emitTelemetry(event: Record<string, unknown>) {
  exportSafeLog(event as Parameters<typeof exportSafeLog>[0]);
  if (process.env.VELO_TELEMETRY_CONSOLE === "true") {
    console.info("velo.telemetry", projectSafeEvent(event));
  }
}

export function redactTelemetry(value: unknown): unknown {
  return projectSafeEvent(value);
}

export type RouteTelemetry = RequestTelemetry & {
  context: TelemetryContext;
  addStage: (name: StandardTelemetryStage, durationMs: number) => void;
  linkTraceparent?: string;
};

type RouteHandler<Args extends unknown[]> = (
  request: Request,
  telemetry: RouteTelemetry,
  ...args: Args
) => Response | Promise<Response>;

/** Fail-open route boundary: telemetry errors can never fail the financial request. */
export function withRouteTelemetry<Args extends unknown[]>(
  operation: string,
  handler: RouteHandler<Args>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const context = telemetryContextFromRequest(request);
    const telemetry: RouteTelemetry = {
      ...startRequestTelemetry(
        { headers: new Headers({ "x-correlation-id": context.requestCorrelationId }) },
        operation,
      ),
      context,
      addStage(name, durationMs) {
        this.stages.push({ name, durationMs });
      },
    };
    try {
      const response = await handler(request, telemetry, ...args);
      if (context.journeyCorrelationId) {
        response.headers.set("X-Velo-Journey-Id", context.journeyCorrelationId);
      }
      return completeRequestTelemetry(telemetry, response);
    } catch (error) {
      emitTelemetry({
        spanName: "velo.http.server",
        operation,
        stage: "mutation",
        outcome: "error",
        errorCode: normalizeErrorCode(error),
        requestCorrelationId: context.requestCorrelationId,
      });
      const response = Response.json(
        {
          error: {
            type: "api_error",
            code: "internal_error",
            message: "The request could not be completed.",
            requestId: context.requestCorrelationId,
          },
        },
        { status: 500 },
      );
      return completeRequestTelemetry(telemetry, response);
    }
  };
}

function safeTimingName(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 48) || "stage";
}

function formatDuration(value: number) {
  return Math.max(0, value).toFixed(2);
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
