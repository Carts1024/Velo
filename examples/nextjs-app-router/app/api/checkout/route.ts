import { Velo } from "@carts1024/velo-sdk";
import { NextResponse } from "next/server";

import {
  getDemoRedirectUrls,
  isCheckoutAnchor,
  requireApiKeyForAnchor,
  type CheckoutAnchor,
} from "./config";

function createVeloClient(anchor: CheckoutAnchor) {
  return new Velo({
    apiKey: requireApiKeyForAnchor(anchor),
    environment: (process.env.VELO_ENV as "testnet" | "production" | "development") || "testnet",
    baseUrl: process.env.VELO_BASE_URL,
  });
}

export async function POST(request: Request) {
  try {
    const { asset = "USDC", anchor } = await request.json().catch(() => ({}));
    if (!isCheckoutAnchor(anchor)) {
      return NextResponse.json(
        { error: 'The checkout anchor must be either "inhouse" or "pdax".' },
        { status: 400 },
      );
    }

    const velo = createVeloClient(anchor);
    const redirectUrls = getDemoRedirectUrls(request.url);

    const session = await velo.checkout.sessions.create(
      {
        amount: "10.00",
        asset,
        anchor,
        description: `Order #1001 (${asset === "native" ? "XLM" : asset})`,
        ...redirectUrls,
      },
      {
        // Supplying an idempotency key is recommended to prevent duplicates on retries
        idempotencyKey: `order-1001-${asset.toLowerCase()}-${Date.now()}`,
      },
    );

    return NextResponse.json({ checkoutUrl: session.checkoutUrl });
  } catch (error) {
    console.error("Velo Checkout error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
