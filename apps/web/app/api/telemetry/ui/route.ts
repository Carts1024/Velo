import { env } from "@/core/config/env";
import { withRouteTelemetry } from "@/core/observability";
import { exportSafeMetric, exportSafeSpan } from "@/core/otlp";
import { api } from "@repo/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const UI_MARKERS = new Set([
  "checkout_start",
  "checkout_ready",
  "payment_submitted_rendered",
  "payment_verified_rendered",
]);
const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
const recordUiMarker = makeFunctionReference<"mutation">(
  "telemetry_outbox/mutations:recordUiMarker",
);
const uiBuckets = new Map<string, { windowStartedAt: number; count: number }>();

function allowUiTelemetry(request: Request) {
  const key = (request.headers.get("x-forwarded-for") ?? "local").split(",", 1)[0]!.trim();
  const now = Date.now();
  const bucket = uiBuckets.get(key);
  if (!bucket || now - bucket.windowStartedAt >= 60_000) {
    if (uiBuckets.size >= 1_000) uiBuckets.delete(uiBuckets.keys().next().value ?? "");
    uiBuckets.set(key, { windowStartedAt: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= 120;
}

export const POST = withRouteTelemetry("ui.telemetry", async (request, telemetry) => {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin telemetry is not accepted." }, { status: 403 });
  }
  if (!allowUiTelemetry(request)) {
    return Response.json({ error: "Telemetry rate limit exceeded." }, { status: 429 });
  }
  const intakeSecret = process.env.VELO_UI_TELEMETRY_INTAKE_SECRET;
  if (!intakeSecret) {
    return Response.json({ error: "UI telemetry is unavailable." }, { status: 503 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 2_048) {
    return Response.json({ error: "Telemetry payload is too large." }, { status: 413 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.paymentIntentId !== "string" ||
    body.paymentIntentId.length > 128 ||
    typeof body.marker !== "string" ||
    !UI_MARKERS.has(body.marker) ||
    typeof body.durationMs !== "number" ||
    !Number.isFinite(body.durationMs) ||
    body.durationMs < 0 ||
    body.durationMs > 3_600_000
  ) {
    return Response.json({ error: "Invalid telemetry payload." }, { status: 400 });
  }
  const intent = await convex.query(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId: body.paymentIntentId as never,
  });
  if (!intent) return Response.json({ error: "Payment intent not found." }, { status: 404 });
  exportSafeSpan({
    spanName: "velo.ui.render",
    operation: body.marker,
    stage: "ui_render",
    outcome: "success",
    durationMs: body.durationMs,
    requestCorrelationId: telemetry.context.requestCorrelationId,
    journeyCorrelationId: intent.correlationId,
    traceparent: intent.traceparent,
  });
  exportSafeMetric(
    "velo_ui_propagation_seconds",
    body.durationMs / 1_000,
    {
      service: "web",
      operation: body.marker,
      outcome: "success",
    },
    "histogram",
  );
  exportSafeMetric(
    "velo_journey_duration_seconds",
    body.durationMs / 1_000,
    {
      service: "web",
      operation: "ui-propagation",
      outcome: "success",
    },
    "histogram",
  );
  await convex.mutation(recordUiMarker, {
    paymentIntentId: body.paymentIntentId as never,
    journeyCorrelationId: intent.correlationId,
    marker: body.marker,
    durationMs: body.durationMs,
    intakeSecret,
  });
  return new Response(null, { status: 202 });
});
