import { Velo } from "../src/index.ts";

declare const process: { env: Record<string, string | undefined> };

/**
 * Run this example:
 * 1. Make sure you are in packages/velo-sdk/
 * 2. Set your API key: export VELO_API_KEY="tk_live_..."
 * 3. Run: node --experimental-strip-types examples/inhouse-checkout.ts
 */
async function main() {
  const apiKey = process.env.VELO_API_KEY || "tk_live_placeholder_inhouse_key";
  console.log("Initializing Velo SDK...");

  const velo = new Velo({
    apiKey,
    environment: "testnet", // Using testnet for sandbox/alpha flows
  });

  try {
    console.log("Creating checkout session with 'inhouse' anchor...");
    const session = await velo.checkout.sessions.create({
      amount: "15.00",
      asset: "USDC",
      anchor: "inhouse", // Explicitly route to in-house owner address
      description: "Standard In-House order",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    console.log("\n--- Created Session Details (V2 Response) ---");
    console.log("Payment Intent ID :", session.paymentIntentId);
    console.log("Checkout URL      :", session.checkoutUrl);
    console.log("Resolved Anchor   :", session.anchor); // 'inhouse'
    console.log("Receiver Address  :", session.receiverAddress); // merchant owner wallet address
    console.log("Receiver Memo     :", session.receiverMemo); // null
    console.log("Deposit Currency  :", session.anchorDepositCurrency); // null
    console.log("Payer Address     :", session.payerAddress); // null (not paid yet)
  } catch (error) {
    console.error("Failed to create session:", error);
  }
}

main();
