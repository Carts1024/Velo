import { getApiKeyFromRequest, hashApiKey } from "@/core/api/auth";
import { env } from "@/core/config/env";
import { api } from "@repo/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const apiKey = getApiKeyFromRequest(request);

  if (!apiKey || !/^tk_live_[a-f0-9]{32}$/.test(apiKey)) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid API key format." },
      { status: 401 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
    const result = await convex.query(api.projects.query.verifyApiKeyAndGetEvents, {
      apiKeyHash: hashApiKey(apiKey),
      limit,
    });

    if (!result.authorized) {
      return NextResponse.json({ error: "Unauthorized: Invalid API key." }, { status: 401 });
    }

    return NextResponse.json({
      project: result.project,
      events: result.events,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 });
  }
}
