import {
  createPaymentIntentHandler,
  listPaymentIntentsHandler,
} from "@/core/api/payment-intent-route-handlers";
import { withRouteTelemetry } from "@/core/observability";

export const POST = withRouteTelemetry("payment_intent.create.v2", createPaymentIntentHandler);
export const GET = withRouteTelemetry("payment_intent.list.v2", listPaymentIntentsHandler);
