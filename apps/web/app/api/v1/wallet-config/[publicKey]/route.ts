import { walletConfigHttpResult } from "@/core/api/wallet-config-response";
import { env } from "@/core/config/env";
import { withRouteTelemetry } from "@/core/observability";
import { api } from "@repo/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ publicKey: string }> };

async function respond(request: NextRequest, context: RouteContext, preflight: boolean) {
  const { publicKey } = await context.params;
  const origin = request.headers.get("origin") ?? undefined;
  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  const lookup = await convex.query(api.wallet_configs.query.getPublishedByKey, {
    publicKey,
    origin,
  });
  const result = walletConfigHttpResult(lookup, origin, preflight);

  if (result.body === null) {
    return new NextResponse(null, { status: result.status, headers: result.headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export const GET = withRouteTelemetry(
  "wallet-config.get.v1",
  async (request, _telemetry, context: RouteContext) =>
    respond(request as NextRequest, context, false),
);

export const OPTIONS = withRouteTelemetry(
  "wallet-config.options.v1",
  async (request, _telemetry, context: RouteContext) =>
    respond(request as NextRequest, context, true),
);
