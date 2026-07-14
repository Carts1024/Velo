export function otelSdkEnvironment(raw: Record<string, string | undefined>) {
  const endpoint = raw.OTEL_EXPORTER_OTLP_ENDPOINT ?? raw.VELO_OTEL_EXPORTER_OTLP_ENDPOINT;
  const authorization =
    raw.OTEL_EXPORTER_OTLP_HEADERS ??
    (raw.VELO_OTEL_EXPORTER_OTLP_AUTHORIZATION
      ? `authorization=${raw.VELO_OTEL_EXPORTER_OTLP_AUTHORIZATION}`
      : undefined);
  return {
    ...(endpoint ? { OTEL_EXPORTER_OTLP_ENDPOINT: endpoint } : {}),
    ...(authorization ? { OTEL_EXPORTER_OTLP_HEADERS: authorization } : {}),
    OTEL_SERVICE_NAME: raw.OTEL_SERVICE_NAME ?? raw.VELO_OTEL_SERVICE_NAME ?? "velo-web",
    OTEL_RESOURCE_ATTRIBUTES:
      raw.OTEL_RESOURCE_ATTRIBUTES ??
      `service.version=${raw.VELO_RELEASE_VERSION ?? "development"}`,
  };
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeOtlpPipeline } = await import("./core/otlp.ts");
    initializeOtlpPipeline();
    if (process.env.VELO_OTEL_ENABLED === "true") {
      try {
        Object.assign(process.env, otelSdkEnvironment(process.env));
        const { registerOTel } = await import("@vercel/otel");
        registerOTel({
          serviceName: process.env.VELO_OTEL_SERVICE_NAME ?? "velo-web",
          attributes: {
            "service.version": process.env.VELO_RELEASE_VERSION ?? "development",
          },
        });
      } catch {
        // Registration is fail-open: application traffic must remain available.
      }
    }
  }
}
