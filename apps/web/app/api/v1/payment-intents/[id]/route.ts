import {
  attachHeaders,
  getApiKeyHashOrError,
  publicPaymentIntentFromDoc,
  veloErrorResponse,
} from "@/core/api/payment-intents";
import { rateLimiter } from "@/core/api/rate-limit";
import { env } from "@/core/config/env";
import { api } from "@repo/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

type PublicPaymentIntentRetrieveResult =
  | { authorized: false; reason?: string }
  | {
      authorized: true;
      projectId: string;
      intent: Parameters<typeof publicPaymentIntentFromDoc>[0] | null;
    };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = getApiKeyHashOrError(request);
  if (!auth.ok) {
    return auth.response;
  }

  const rateLimitResult = rateLimiter.checkLimit(auth.apiKeyHash);
  if (!rateLimitResult.allowed) {
    return veloErrorResponse({
      status: 429,
      type: "rate_limit_error",
      code: "rate_limit_exceeded",
      message: "Rate limit exceeded.",
      headers: rateLimitResult.headers,
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
        rateLimitResult.headers,
      );
    }

    rateLimiter.cacheKeyProjectMapping(auth.apiKeyHash, result.projectId);

    if (!result.intent) {
      return attachHeaders(
        veloErrorResponse({
          status: 404,
          type: "not_found_error",
          code: "payment_intent_not_found",
          message: "Payment intent not found.",
        }),
        rateLimitResult.headers,
      );
    }

    const response = NextResponse.json(
      publicPaymentIntentFromDoc(result.intent, env.NEXT_PUBLIC_APP_URL),
    );
    return attachHeaders(response, rateLimitResult.headers);
  } catch (error) {
    console.error("Payment intent retrieve failed:", error);
    return attachHeaders(
      veloErrorResponse({
        status: 500,
        type: "api_error",
        code: "internal_error",
        message: "Internal server error.",
      }),
      rateLimitResult.headers,
    );
  }
}
