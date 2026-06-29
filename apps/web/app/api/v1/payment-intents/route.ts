import { getApiKeyFromRequest, hashApiKey } from "@/core/api/auth";
import { env } from "@/core/config/env";
import { stellarConfig } from "@/core/config/stellar";
import { api } from "@repo/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

const API_KEY_PATTERN = /^tk_live_[a-f0-9]{32}$/;

export async function POST(request: NextRequest) {
  // 1. Extract and validate API key
  const apiKey = getApiKeyFromRequest(request);

  if (!apiKey || !API_KEY_PATTERN.test(apiKey)) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid API key format." },
      { status: 401 },
    );
  }

  // 2. Parse request body
  let body: {
    amount: string;
    asset?: string;
    description?: string;
    successUrl?: string;
    cancelUrl?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad Request: Invalid JSON body." }, { status: 400 });
  }

  if (!body.amount || Number.parseFloat(body.amount) <= 0) {
    return NextResponse.json(
      { error: "Bad Request: amount is required and must be positive." },
      { status: 400 },
    );
  }

  try {
    const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

    // 3. Verify key hash, check payments access, and create payment intent
    const apiKeyHash = hashApiKey(apiKey);
    const paymentIntentId = await convex.mutation(
      api.payment_intents.mutations.createPaymentIntent,
      {
        apiKeyHash,
        amount: body.amount,
        asset: body.asset || stellarConfig.checkoutAsset,
        description: body.description,
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
      },
    );

    // 4. Return payment intent ID and checkout URL
    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const checkoutUrl = `${appUrl}/pay/${paymentIntentId}`;

    return NextResponse.json(
      {
        paymentIntentId,
        checkoutUrl,
        expiresIn: 1800, // 30 minutes in seconds
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Payment intent creation failed:", message);
    return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 });
  }
}
