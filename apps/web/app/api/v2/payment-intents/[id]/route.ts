import { retrievePaymentIntentHandler } from "@/core/api/payment-intent-route-handlers";
import { withRouteTelemetry } from "@/core/observability";

export const GET = withRouteTelemetry(
  "payment_intent.retrieve.v2",
  (request, telemetry, args: { params: Promise<{ id: string }> }) =>
    retrievePaymentIntentHandler("v2", request, telemetry, args),
);
