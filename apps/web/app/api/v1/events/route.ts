import { getApiKeyFromRequest, hashApiKey } from "@/core/api/auth";
import { rateLimiter } from "@/core/api/rate-limit";
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

  const apiKeyHash = hashApiKey(apiKey);
  const rateLimitResult = rateLimiter.checkLimit(apiKeyHash);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests: Rate limit exceeded." },
      {
        status: 429,
        headers: rateLimitResult.headers,
      },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
    const result = await convex.query(api.projects.query.verifyApiKeyAndGetEvents, {
      apiKeyHash,
      limit,
    });

    if (!result.authorized) {
      return NextResponse.json({ error: "Unauthorized: Invalid API key." }, { status: 401 });
    }

    if (result.project?.id) {
      rateLimiter.cacheKeyProjectMapping(apiKeyHash, result.project.id);
    }

    const response = NextResponse.json({
      project: result.project,
      events: result.events,
    });

    Object.entries(rateLimitResult.headers).forEach(([key, val]) => {
      response.headers.set(key, val);
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 });
  }
}
