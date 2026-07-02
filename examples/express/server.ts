import express from "express";
import { Velo } from "@carts1024/velo-sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize Velo SDK
const velo = new Velo({
  apiKey: process.env.VELO_API_KEY || "tk_test_placeholder_key",
  environment: (process.env.VELO_ENV as "testnet" | "production" | "development") || "testnet",
  baseUrl: process.env.VELO_BASE_URL,
});

// JSON body parser for normal routes
app.use(express.json());

// Create Checkout Session
app.post("/api/checkout", async (req, res) => {
  try {
    const session = await velo.checkout.sessions.create(
      {
        amount: "10.00",
        asset: "USDC",
        description: "Order #1001",
        successUrl: "http://localhost:3001/success",
        cancelUrl: "http://localhost:3001/cancel",
      },
      {
        idempotencyKey: `order-1001-${Date.now()}`,
      }
    );

    res.status(201).json({ checkoutUrl: session.checkoutUrl });
  } catch (error) {
    console.error("Checkout creation failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// Webhook signature verification
// Webhooks require the raw body as a string. Use express.raw for this specific endpoint.
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-velo-signature"];
  const secret = process.env.VELO_WEBHOOK_SECRET;

  if (!signature || !secret) {
    res.status(400).send("Missing signature header or webhook secret");
    return;
  }

  // Retrieve raw request body string
  const payload = req.body.toString("utf8");

  try {
    const event = await Velo.webhooks.verify({
      payload,
      signature: Array.isArray(signature) ? signature[0] : signature,
      secret,
    });

    console.log(`Verified webhook event: ${event.type}`);

    if (event.type === "payment.succeeded") {
      console.log(`Payment succeeded: ${event.paymentIntent.id}`);
      // Process successful payment
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    res.status(400).send("Webhook signature verification failed");
  }
});

app.listen(port, () => {
  console.log(`Express server running on http://localhost:${port}`);
});
