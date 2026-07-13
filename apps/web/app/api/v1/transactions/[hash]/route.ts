import { getApiKeyFromRequest, hashApiKey } from "@/core/api/auth";
import {
  consumeDistributedRateLimit,
  distributedRateLimitHeaders,
} from "@/core/api/distributed-rate-limit";
import { env } from "@/core/config/env";
import { api } from "@repo/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const apiKey = getApiKeyFromRequest(request);

  if (!apiKey || !/^tk_live_[a-f0-9]{32}$/.test(apiKey)) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid API key format." },
      { status: 401 },
    );
  }

  const apiKeyHash = hashApiKey(apiKey);
  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  const rateLimitResult = await consumeDistributedRateLimit(convex, apiKeyHash);
  if (!rateLimitResult.authorized) {
    return NextResponse.json({ error: "Unauthorized: Invalid API key." }, { status: 401 });
  }
  const rateLimitHeaders = distributedRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests: Rate limit exceeded." },
      {
        status: 429,
        headers: rateLimitHeaders,
      },
    );
  }

  if (!hash || hash.trim().length !== 64) {
    return NextResponse.json(
      { error: "Bad Request: Invalid transaction hash format." },
      { status: 400 },
    );
  }

  try {
    const result = await convex.query(api.projects.query.verifyApiKeyAndGetTransaction, {
      apiKeyHash,
      hash: hash,
    });

    if (!result.authorized) {
      return NextResponse.json({ error: "Unauthorized: Invalid API key." }, { status: 401 });
    }

    if (!result.transaction) {
      return NextResponse.json(
        { error: `Not Found: Transaction ${hash} not found.` },
        { status: 404 },
      );
    }

    const response = NextResponse.json({
      transaction: result.transaction,
    });

    Object.entries(rateLimitHeaders).forEach(([key, val]) => {
      response.headers.set(key, val);
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 });
  }
}
