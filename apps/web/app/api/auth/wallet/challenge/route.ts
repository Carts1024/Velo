import { createWalletChallenge } from "@/core/auth/wallet-jwt";
import { withRouteTelemetry } from "@/core/observability";
import { NextResponse } from "next/server";

export const POST = withRouteTelemetry("wallet.challenge", async (request) => {
  try {
    const body = (await request.json()) as { address?: string };
    if (!body.address) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    return NextResponse.json(createWalletChallenge(body.address));
  } catch {
    return NextResponse.json({ error: "Unable to create challenge" }, { status: 400 });
  }
});
