import {
  attachHeaders,
  getApiKeyHashOrError,
  getIdempotencyKey,
  parseCreatePaymentIntentBody,
  parseListPaymentIntentQuery,
  publicPaymentIntentFromDocV2,
  veloErrorResponse,
} from "@/core/api/payment-intents";
import { rateLimiter } from "@/core/api/rate-limit";
import { env } from "@/core/config/env";
import { stellarConfig } from "@/core/config/stellar";
import {
  completeRequestTelemetry,
  measureTelemetryStage,
  startRequestTelemetry,
} from "@/core/observability";
import { api } from "@repo/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

type PublicPaymentIntentMutationResult =
  | { status: "unauthorized"; reason?: string }
  | { status: "anchor_not_connected"; projectId: string }
  | { status: "idempotency_conflict"; projectId: string }
  | {
      status: "success" | "idempotency_replay";
      projectId: string;
      intent: Parameters<typeof publicPaymentIntentFromDocV2>[0];
    };

type PublicPaymentIntentListResult =
  | { authorized: false; reason?: string }
  | {
      authorized: true;
      projectId: string;
      page: {
        page: Parameters<typeof publicPaymentIntentFromDocV2>[0][];
        isDone: boolean;
        continueCursor: string;
      };
    };

const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

export async function POST(request: NextRequest) {
  const telemetry = startRequestTelemetry(request, "payment_intent.create.v2");
  const complete = <T extends Response>(response: T) =>
    completeRequestTelemetry(telemetry, response);
  const auth = getApiKeyHashOrError(request);
  if (!auth.ok) {
    return complete(auth.response);
  }

  const rateLimitResult = rateLimiter.checkLimit(auth.apiKeyHash);
  if (!rateLimitResult.allowed) {
    return complete(
      veloErrorResponse({
        status: 429,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded.",
        headers: rateLimitResult.headers,
      }),
    );
  }

  const parsed = await parseCreatePaymentIntentBody(request);
  if (!parsed.ok) {
    return complete(attachHeaders(parsed.response, rateLimitResult.headers));
  }

  try {
    const requestedAsset = parsed.body.asset;
    const resolvedAsset =
      !requestedAsset || requestedAsset === "USDC" ? stellarConfig.checkoutAsset : requestedAsset;

    const result = (await measureTelemetryStage(telemetry, "convex.mutation", () =>
      convex.mutation(
        api.payment_intents.mutations.createPublicPaymentIntentV2,
        {
          apiKeyHash: auth.apiKeyHash,
          correlationId: telemetry.correlationId,
          amount: parsed.body.amount,
          asset: resolvedAsset,
          ...(parsed.body.description !== undefined
            ? { description: parsed.body.description }
            : {}),
          ...(parsed.body.successUrl !== undefined ? { successUrl: parsed.body.successUrl } : {}),
          ...(parsed.body.cancelUrl !== undefined ? { cancelUrl: parsed.body.cancelUrl } : {}),
          ...(parsed.body.anchor !== undefined
            ? { anchor: parsed.body.anchor as "inhouse" | "pdax" }
            : {}),
          ...(getIdempotencyKey(request) !== undefined
            ? { idempotencyKey: getIdempotencyKey(request) }
            : {}),
        },
        { skipQueue: true },
      ),
    )) as PublicPaymentIntentMutationResult;

    if (result.status === "unauthorized") {
      return complete(
        attachHeaders(
          veloErrorResponse({
            status: 401,
            type: "auth_error",
            code: "invalid_api_key",
            message: result.reason || "Invalid API key.",
          }),
          rateLimitResult.headers,
        ),
      );
    }

    rateLimiter.cacheKeyProjectMapping(auth.apiKeyHash, result.projectId);

    if (result.status === "anchor_not_connected") {
      return complete(
        attachHeaders(
          veloErrorResponse({
            status: 409,
            type: "validation_error",
            code: "anchor_not_connected",
            message: "PDAX provider is not connected for this project.",
          }),
          rateLimitResult.headers,
        ),
      );
    }

    if (result.status === "idempotency_conflict") {
      return complete(
        attachHeaders(
          veloErrorResponse({
            status: 409,
            type: "idempotency_error",
            code: "idempotency_key_conflict",
            message: "Idempotency-Key was already used with a different request body.",
          }),
          rateLimitResult.headers,
        ),
      );
    }

    const response = NextResponse.json(
      publicPaymentIntentFromDocV2(result.intent, env.NEXT_PUBLIC_APP_URL),
      {
        status: result.status === "idempotency_replay" ? 200 : 201,
      },
    );
    return complete(attachHeaders(response, rateLimitResult.headers));
  } catch (error) {
    console.error("Payment intent V2 creation failed:", error);

    // Check if the action threw an anchor_unavailable error
    if (error instanceof Error) {
      const data = (error as { data?: { code?: string } }).data;
      if (
        (data && data.code === "anchor_unavailable") ||
        error.message.includes("anchor_unavailable")
      ) {
        return complete(
          attachHeaders(
            veloErrorResponse({
              status: 503,
              type: "api_error",
              code: "anchor_unavailable",
              message: "The requested payment anchor is currently unavailable.",
              headers: {
                "X-Error-Code": "anchor_unavailable",
                "X-Error-Dependency": "pdax",
                "X-Error-Source": "payment_intent_route_enrichment",
              },
            }),
            rateLimitResult.headers,
          ),
        );
      }
    }

    return complete(
      attachHeaders(
        veloErrorResponse({
          status: 500,
          type: "api_error",
          code: "internal_error",
          message: "Internal server error.",
        }),
        rateLimitResult.headers,
      ),
    );
  }
}

export async function GET(request: NextRequest) {
  const telemetry = startRequestTelemetry(request, "payment_intent.list.v2");
  const complete = <T extends Response>(response: T) =>
    completeRequestTelemetry(telemetry, response);
  const auth = getApiKeyHashOrError(request);
  if (!auth.ok) {
    return complete(auth.response);
  }

  const rateLimitResult = rateLimiter.checkLimit(auth.apiKeyHash);
  if (!rateLimitResult.allowed) {
    return complete(
      veloErrorResponse({
        status: 429,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded.",
        headers: rateLimitResult.headers,
      }),
    );
  }

  const parsed = parseListPaymentIntentQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return complete(attachHeaders(parsed.response, rateLimitResult.headers));
  }

  try {
    const result = (await measureTelemetryStage(telemetry, "convex.query", () =>
      convex.query(api.payment_intents.queries.listPublicPaymentIntents, {
        apiKeyHash: auth.apiKeyHash,
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        paginationOpts: parsed.paginationOpts,
      }),
    )) as PublicPaymentIntentListResult;

    if (!result.authorized) {
      return complete(
        attachHeaders(
          veloErrorResponse({
            status: 401,
            type: "auth_error",
            code: "invalid_api_key",
            message: result.reason || "Invalid API key.",
          }),
          rateLimitResult.headers,
        ),
      );
    }

    rateLimiter.cacheKeyProjectMapping(auth.apiKeyHash, result.projectId);

    const response = NextResponse.json({
      object: "list",
      data: result.page.page.map((intent) =>
        publicPaymentIntentFromDocV2(intent, env.NEXT_PUBLIC_APP_URL),
      ),
      hasMore: !result.page.isDone,
      nextCursor: result.page.isDone ? null : result.page.continueCursor,
    });
    return complete(attachHeaders(response, rateLimitResult.headers));
  } catch (error) {
    console.error("Payment intent list failed:", error);
    return complete(
      attachHeaders(
        veloErrorResponse({
          status: 500,
          type: "api_error",
          code: "internal_error",
          message: "Internal server error.",
        }),
        rateLimitResult.headers,
      ),
    );
  }
}
