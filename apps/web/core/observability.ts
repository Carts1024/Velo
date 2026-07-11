const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/;
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
};

/**
 * Uses an inbound correlation ID only when it is safe to echo into logs and headers.
 * This avoids accidentally reflecting API keys, signatures, or arbitrary payloads.
 */
export function correlationIdFromRequest(request: { headers: Headers }): string {
  const supplied = request.headers.get("x-correlation-id")?.trim();
  if (supplied && CORRELATION_ID_PATTERN.test(supplied)) {
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

  response.headers.set("X-Correlation-Id", telemetry.correlationId);
  response.headers.set("Server-Timing", entries.join(", "));
  emitTelemetry({
    correlationId: telemetry.correlationId,
    operation: telemetry.operation,
    totalMs: Math.round(totalMs * 100) / 100,
    stages: telemetry.stages,
  });
  return response;
}

/**
 * Structured telemetry is deliberately redacted before it reaches logs. This is
 * also the single place route and worker instrumentation should use for events.
 */
export function emitTelemetry(event: Record<string, unknown>) {
  console.info("velo.telemetry", redactTelemetry(event));
}

export function redactTelemetry(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactTelemetry);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveTelemetryKey(key) ? "[REDACTED]" : redactTelemetry(nestedValue),
    ]),
  );
}

function isSensitiveTelemetryKey(key: string) {
  return /(authorization|api.?key|secret|signature|token|password|private|signedxdr|xdr|payload|wallet.?seed|seed|seed.?phrase|mnemonic|passphrase|recovery.?phrase)/i.test(
    key,
  );
}

function safeTimingName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "stage";
}

function formatDuration(value: number) {
  return Math.max(0, value).toFixed(2);
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
