import { createWalletJwt, verifyWalletChallenge } from "@/core/auth/wallet-jwt";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify wallet signature";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
