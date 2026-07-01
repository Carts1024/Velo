import { createWalletChallenge } from "@/core/auth/wallet-jwt";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string };
    if (!body.address) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    return NextResponse.json(createWalletChallenge(body.address));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create challenge";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
