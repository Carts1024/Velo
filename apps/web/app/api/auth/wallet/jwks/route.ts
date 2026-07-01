import { walletJwks } from "@/core/auth/wallet-jwt";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(walletJwks(), {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}
