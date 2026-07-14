import {
  consumeDistributedRateLimit,
  distributedRateLimitHeaders,
} from "@/core/api/distributed-rate-limit";
import {
  attachHeaders,
  getApiKeyHashOrError,
  publicPaymentIntentFromDocV2,
  veloErrorResponse,
} from "@/core/api/payment-intents";
import { env } from "@/core/config/env";
import { withRouteTelemetry } from "@/core/observability";
import { api } from "@repo/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

type PublicPaymentIntentRetrieveResult =
  | { authorized: false; reason?: string }
  | {
      authorized: true;
      projectId: string;
      intent: Parameters<typeof publicPaymentIntentFromDocV2>[0] | null;
    };

export const GET = withRouteTelemetry(
  "payment_intent.retrieve.v2",
  async (baseRequest, _telemetry, { params }: { params: Promise<{ id: string }> }) => {
    const request = baseRequest as NextRequest;
    const { id } = await params;
    const auth = getApiKeyHashOrError(request);
    if (!auth.ok) {
      return auth.response;
    }

    const rateLimitResult = await consumeDistributedRateLimit(convex, auth.apiKeyHash);
    if (!rateLimitResult.authorized) {
      return veloErrorResponse({
        status: 401,
        type: "auth_error",
        code: "invalid_api_key",
        message: "Invalid API key.",
      });
    }
    const rateLimitHeaders = distributedRateLimitHeaders(rateLimitResult);
    if (!rateLimitResult.allowed) {
      return veloErrorResponse({
        status: 429,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded.",
        headers: rateLimitHeaders,
      });
    }

    try {
      const result = (await convex.query(api.payment_intents.queries.getPublicPaymentIntent, {
        apiKeyHash: auth.apiKeyHash,
        paymentIntentId: id,
      })) as PublicPaymentIntentRetrieveResult;

      if (!result.authorized) {
        return attachHeaders(
          veloErrorResponse({
            status: 401,
            type: "auth_error",
            code: "invalid_api_key",
            message: result.reason || "Invalid API key.",
          }),
          rateLimitHeaders,
        );
      }

      if (!result.intent) {
        return attachHeaders(
          veloErrorResponse({
            status: 404,
            type: "not_found_error",
            code: "payment_intent_not_found",
            message: "Payment intent not found.",
          }),
          rateLimitHeaders,
        );
      }

      const response = NextResponse.json(
        publicPaymentIntentFromDocV2(result.intent, env.NEXT_PUBLIC_APP_URL),
      );
      return attachHeaders(response, rateLimitHeaders);
    } catch {
      return attachHeaders(
        veloErrorResponse({
          status: 500,
          type: "api_error",
          code: "internal_error",
          message: "Internal server error.",
        }),
        rateLimitHeaders,
      );
    }
  },
);
