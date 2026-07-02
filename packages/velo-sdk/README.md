# Velo SDK for Node.js (Alpha)

The official Velo SDK for Node.js and modern JavaScript environments.

> [!NOTE]
> This package is currently in **Alpha** (`0.1.0-alpha.1`) and is meant for server-side environments only.

## Installation

```bash
npm install @velo/sdk
# or
pnpm add @velo/sdk
# or
yarn add @velo/sdk
```

## Getting Started

Initialize the client with your Velo API key:

```ts
import { Velo } from "@velo/sdk";

const velo = new Velo({
  apiKey: process.env.VELO_API_KEY!,
  environment: "testnet", // 'production', 'testnet', or 'development'
});
```

### Creating a Checkout Session

```ts
const { checkoutUrl, paymentIntentId } = await velo.checkout.sessions.create({
  amount: "10.00",
  asset: "USDC",
  description: "Order #1001",
  successUrl: "https://yourdomain.com/success",
  cancelUrl: "https://yourdomain.com/cancel",
});

// Redirect customer to the checkout URL
```

### Retrieving a Payment Intent

```ts
const paymentIntent = await velo.paymentIntents.retrieve("pi_12345");
console.log(`Payment status: ${paymentIntent.status}`);
```

---

## Webhook Verification

Velo signs webhook events sent to your endpoints using HMAC-SHA256. Webhook verification is required to verify that incoming payloads are authentic and untampered.

> [!IMPORTANT]
> Webhook signature verification requires the **raw, unparsed request body**. Do not parse the request body as JSON prior to calling verify.
>
> Your webhook signing secret (`VELO_WEBHOOK_SECRET`) must remain **server-side only**. Never expose it to the browser.

### Verification API

You can verify signatures using the static `Velo.webhooks.verify` method or an instance-level `velo.webhooks.verify` method:

```ts
const event = await Velo.webhooks.verify({
  payload: rawBody, // Raw string payload
  signature: signatureHeader, // 'x-velo-signature' header value
  secret: process.env.VELO_WEBHOOK_SECRET!, // Webhook signing secret
  toleranceSeconds: 300, // Optional clock drift tolerance (default 5 minutes)
});
```

`verify` will throw a `VeloWebhookSignatureVerificationError` (which extends `VeloValidationError`) if:

- The signature is missing or malformed.
- The timestamp is expired (older than `toleranceSeconds` or from the future).
- The computed signature does not match the header.

### Next.js App Router Example

```ts
import { NextResponse } from "next/server";
import { Velo } from "@velo/sdk";

export async function POST(request: Request) {
  // 1. Get the raw text payload (DO NOT call request.json())
  const payload = await request.text();

  // 2. Get the signature header
  const signature = request.headers.get("x-velo-signature");
  const secret = process.env.VELO_WEBHOOK_SECRET!;

  try {
    // 3. Verify the signature
    const event = await Velo.webhooks.verify({
      payload,
      signature,
      secret,
    });

    // 4. Handle typed events
    switch (event.type) {
      case "payment.succeeded": {
        const paymentIntent = event.paymentIntent;
        console.log(`Payment succeeded for amount: ${paymentIntent.amount}`);
        break;
      }
      case "payment.failed": {
        console.log(`Payment failed: ${event.paymentIntent.id}`);
        break;
      }
      case "payment_access.activated": {
        console.log(`Project payment access activated!`);
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Signature verification failed:", error);
    return new NextResponse("Webhook signature verification failed", { status: 400 });
  }
}
```

### Express.js Example

Ensure you capture the raw body as a string. You can use `express.raw` middleware for this specific route.

```ts
import express from "express";
import { Velo } from "@velo/sdk";

const app = express();

app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  // 1. Get raw string payload
  const payload = req.body.toString("utf8");

  // 2. Get the signature header
  const signature = req.headers["x-velo-signature"];
  const secret = process.env.VELO_WEBHOOK_SECRET!;

  try {
    // 3. Verify signature
    const event = await Velo.webhooks.verify({
      payload,
      signature: Array.isArray(signature) ? signature[0] : signature || null,
      secret,
    });

    // 4. Handle events
    if (event.type === "payment.succeeded") {
      console.log(`Payment succeeded: ${event.paymentIntent.id}`);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Signature verification failed:", error);
    res.status(400).send("Webhook signature verification failed");
  }
});
```

---

## Environment Variables

Configure the following environment variables in your server environments:

| Variable              | Required          | Description                                                                                     |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `VELO_API_KEY`        | **Yes**           | Your Velo project API key (e.g. `tk_live_...` or `tk_test_...`).                                |
| `VELO_WEBHOOK_SECRET` | Only for Webhooks | Used to verify signature of incoming webhook events.                                            |
| `VELO_BASE_URL`       | No                | Overrides the default Velo API endpoint (defaults to `https://api.velo.xyz` or local dev base). |

---

## Idempotency

To prevent double-charging or duplicate session creation due to network retries, pass an `idempotencyKey` in the `RequestOptions` object as the second parameter:

```ts
const session = await velo.checkout.sessions.create(
  {
    amount: "10.00",
    asset: "USDC",
    description: "Order #1001",
  },
  {
    idempotencyKey: "unique-order-id-1001", // Prevents duplicates
  },
);
```

Idempotency keys are scoped to your project. Repeating a request with the same payload and same key will return the cached original response. Repeating with a different payload will throw a `VeloAPIError` with status code `409` (conflict).

---

## Testnet vs Mainnet & Alpha Limitations

> [!WARNING]
> This SDK is currently in **Alpha** (`0.1.0-alpha.1`) and subject to changes.
>
> - **Stellar Testnet Only**: During the alpha phase, all transactions and checkout sessions are routed through the Stellar Testnet. Mainnet is currently unsupported.
> - **ESM-Only**: The package uses ESM exports and requires `"type": "module"` or an ESM-compatible bundler/environment. CommonJS `require()` is not supported directly.
> - **Server-Side Only**: The SDK initializes and communicates using highly sensitive API keys and secrets. Do **NOT** use this SDK in browser environments or client-side code as it will leak your API credentials.
> - **Browser Limitations**: Direct wallet connection, browser-based payment tracking, and front-end React components are excluded from the current alpha release.
