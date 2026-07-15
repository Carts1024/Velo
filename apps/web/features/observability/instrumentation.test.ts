import assert from "node:assert/strict";
import test from "node:test";

import { otelSdkEnvironment } from "../../instrumentation.ts";

test("maps server-only Velo OTLP configuration to the OpenTelemetry SDK environment", () => {
  assert.deepEqual(
    otelSdkEnvironment({
      VELO_OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
      VELO_OTEL_EXPORTER_OTLP_AUTHORIZATION: "Bearer secret",
      VELO_OTEL_SERVICE_NAME: "velo-test",
      VELO_RELEASE_VERSION: "release-10",
    }),
    {
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
      OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer secret",
      OTEL_SERVICE_NAME: "velo-test",
      OTEL_RESOURCE_ATTRIBUTES: "service.version=release-10",
    },
  );
});
