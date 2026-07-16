import { createWalletJwt, verifyWalletChallenge } from "@/core/auth/wallet-jwt";
import { withRouteTelemetry } from "@/core/observability";
import { NextResponse } from "next/server";

export const POST = withRouteTelemetry("wallet.verify", async (request) => {
  try {
    const body = (await request.json()) as {
      address?: string;
      challenge?: string;
    };

    if (!body.address || !body.challenge) {
      return NextResponse.json({ error: "Missing wallet signature payload" }, { status: 400 });
    }

    const address = verifyWalletChallenge({
      address: body.address,
      challenge: body.challenge,
    });

    return NextResponse.json({ token: createWalletJwt(address), address });
  } catch {
    return NextResponse.json({ error: "Unable to verify wallet signature" }, { status: 401 });
  }
});
