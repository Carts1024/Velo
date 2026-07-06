import { env } from "@/core/config/env";
import { api } from "@repo/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null);

    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
    const result = await convex.action(api.settlement.actions.handlePdaxWebhook, {
      payload,
    });

    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("PDAX webhook handling failed:", error);
    return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 });
  }
}
