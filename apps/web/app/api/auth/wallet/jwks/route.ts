import { walletJwks } from "@/core/auth/wallet-jwt";
import { withRouteTelemetry } from "@/core/observability";
import { NextResponse } from "next/server";

export const GET = withRouteTelemetry("wallet.jwks", async () => {
  return NextResponse.json(walletJwks(), {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
});
