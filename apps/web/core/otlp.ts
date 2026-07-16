import {
  createTraceparent,
  deterministicSample,
  projectSafeEvent,
  traceIdentifiers,
  validateMetricLabels,
  type SafeTelemetryEvent,
} from "@repo/observability";

import type { MetricName } from "@repo/observability";

export type OtlpConfig = {
  enabled: boolean;
  endpoint: string;
  authorization?: string;
  serviceName: string;
  releaseVersion: string;
  successSampleRatio: number;
};

export function readOtlpConfig(raw: Record<string, string | undefined>): OtlpConfig {
  const ratio = Number(raw.VELO_OTEL_SUCCESS_SAMPLE_RATIO ?? "0.1");
  return {
    enabled: raw.VELO_OTEL_ENABLED === "true",
    endpoint: raw.VELO_OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318",
    ...(raw.VELO_OTEL_EXPORTER_OTLP_AUTHORIZATION
      ? { authorization: raw.VELO_OTEL_EXPORTER_OTLP_AUTHORIZATION }
      : {}),
    serviceName: raw.VELO_OTEL_SERVICE_NAME ?? "velo-web",
    releaseVersion: raw.VELO_RELEASE_VERSION ?? "development",
    successSampleRatio: Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0.1,
  };
}

const config = readOtlpConfig(process.env);
let testPayloadObserver: ((payload: unknown) => void) | undefined;

export function setOtlpPayloadObserverForTests(observer?: (payload: unknown) => void) {
  testPayloadObserver = observer;
}

/**
 * Best-effort OTLP/HTTP JSON export. Callers deliberately do not await this;
 * collector outages cannot add latency or change a financial operation.
 */
export function exportSafeSpan(event: SafeTelemetryEvent): void {
  const exportable = config.enabled && shouldExportSpan(event, config.successSampleRatio);
  if (!testPayloadObserver && !exportable) return;
  const payload = buildOtlpTracePayload(event, config, Date.now());
  testPayloadObserver?.(payload);
  if (!exportable) return;
  void fetch(`${config.endpoint.replace(/\/$/, "")}/v1/traces`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.authorization ? { authorization: config.authorization } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1_000),
  }).catch(() => undefined);
}

export function shouldExportSpan(event: SafeTelemetryEvent, successRatio = 0.1) {
  if (event.outcome !== "success") return true;
  const key = event.journeyCorrelationId ?? event.requestCorrelationId;
  return key ? deterministicSample(key, successRatio) : false;
}

export function buildOtlpTracePayload(
  event: SafeTelemetryEvent,
  current = config,
  endMs = Date.now(),
) {
  const safe = projectSafeEvent(event);
  const attributes = Object.entries(safe).map(([key, value]) => ({
    key: `velo.${key}`,
    value:
      typeof value === "number"
        ? { doubleValue: value }
        : typeof value === "boolean"
          ? { boolValue: value }
          : { stringValue: String(value) },
  }));
  const context = event.traceparent ?? createTraceparent();
  const identifiers = traceIdentifiers(context);
  const link = event.linkedTraceparent ? traceIdentifiers(event.linkedTraceparent) : undefined;
  const endNs = BigInt(Math.floor(endMs)) * 1_000_000n;
  const startNs = endNs - BigInt(Math.max(0, Math.floor(event.durationMs ?? 0))) * 1_000_000n;
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: current.serviceName } },
            { key: "service.version", value: { stringValue: current.releaseVersion } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "@repo/observability" },
            spans: [
              {
                traceId: identifiers.traceId,
                spanId: identifiers.spanId,
                parentSpanId: identifiers.parentSpanId,
                name: event.spanName,
                kind: 2,
                startTimeUnixNano: String(startNs),
                endTimeUnixNano: String(endNs),
                attributes,
                status: { code: event.outcome === "success" ? 1 : 2 },
                ...(link
                  ? {
                      links: [{ traceId: link.traceId, spanId: link.parentSpanId, attributes: [] }],
                    }
                  : {}),
              },
            ],
          },
        ],
      },
    ],
  };
}

export function initializeOtlpPipeline() {
  return { ...config };
}

export function exportSafeLog(event: SafeTelemetryEvent): void {
  if (!config.enabled) return;
  const safe = projectSafeEvent(event);
  const payload = {
    resourceLogs: [
      {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: config.serviceName } }],
        },
        scopeLogs: [
          {
            scope: { name: "@repo/observability" },
            logRecords: [
              {
                timeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
                severityText: event.outcome === "success" ? "INFO" : "ERROR",
                body: { stringValue: JSON.stringify(safe) },
                attributes: [],
              },
            ],
          },
        ],
      },
    ],
  };
  void fetch(`${config.endpoint.replace(/\/$/, "")}/v1/logs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.authorization ? { authorization: config.authorization } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1_000),
  }).catch(() => undefined);
}

export function exportSafeMetric(
  name: MetricName,
  value: number,
  labels: Record<string, string>,
  kind: "counter" | "gauge" | "histogram" = "counter",
): void {
  if (!config.enabled || !validateMetricLabels(labels)) return;
  const payload = buildOtlpMetricPayload(name, value, labels, kind);
  void fetch(`${config.endpoint.replace(/\/$/, "")}/v1/metrics`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.authorization ? { authorization: config.authorization } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1_000),
  }).catch(() => undefined);
}

export function buildOtlpMetricPayload(
  name: MetricName,
  value: number,
  labels: Record<string, string>,
  kind: "counter" | "gauge" | "histogram" = "counter",
): {
  resourceMetrics: Array<{
    resource: { attributes: unknown[] };
    scopeMetrics: Array<{
      scope: { name: string };
      metrics: Array<{
        name: MetricName;
        sum?: {
          aggregationTemporality: number;
          isMonotonic: boolean;
          dataPoints: Array<{ asDouble: number }>;
        };
        gauge?: { dataPoints: Array<{ asDouble: number }> };
        histogram?: {
          aggregationTemporality: number;
          dataPoints: Array<{
            count: string;
            sum: number;
            explicitBounds: number[];
            bucketCounts: string[];
          }>;
        };
      }>;
    }>;
  }>;
} {
  const dataPoint = {
    asDouble: value,
    timeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
    attributes: Object.entries(labels).map(([key, nested]) => ({
      key,
      value: { stringValue: nested },
    })),
  };
  const bounds = [0.05, 0.1, 0.25, 0.35, 0.5, 1, 1.5, 2, 3, 5, 8, 10, 30];
  const bucketCounts = Array.from({ length: bounds.length + 1 }, () => "0");
  bucketCounts[
    bounds.findIndex((bound) => value <= bound) === -1
      ? bounds.length
      : bounds.findIndex((bound) => value <= bound)
  ] = "1";
  const metric =
    kind === "histogram"
      ? {
          name,
          histogram: {
            aggregationTemporality: 1,
            dataPoints: [
              {
                count: "1",
                sum: value,
                explicitBounds: bounds,
                bucketCounts,
                timeUnixNano: dataPoint.timeUnixNano,
                attributes: dataPoint.attributes,
              },
            ],
          },
        }
      : kind === "gauge"
        ? { name, gauge: { dataPoints: [dataPoint] } }
        : { name, sum: { aggregationTemporality: 1, isMonotonic: true, dataPoints: [dataPoint] } };
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: config.serviceName } }],
        },
        scopeMetrics: [{ scope: { name: "@repo/observability" }, metrics: [metric] }],
      },
    ],
  };
}
