import { NextResponse } from "next/server";
import { Velo } from "@velo/sdk";

// Initialize Velo client. Keep apiKey secure server-side!
const velo = new Velo({
  apiKey: process.env.VELO_API_KEY || "tk_test_placeholder_key",
  environment: (process.env.VELO_ENV as "testnet" | "production" | "development") || "testnet",
  baseUrl: process.env.VELO_BASE_URL, // Optional override
});

export async function POST() {
  try {
    const session = await velo.checkout.sessions.create(
      {
        amount: "10.00",
        asset: "USDC",
        description: "Order #1001",
        successUrl: "http://localhost:3000/success",
        cancelUrl: "http://localhost:3000/cancel",
      },
      {
        // Supplying an idempotency key is recommended to prevent duplicates on retries
        idempotencyKey: `order-1001-${Date.now()}`,
      }
    );

    return NextResponse.json({ checkoutUrl: session.checkoutUrl });
  } catch (error) {
    console.error("Velo Checkout error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
