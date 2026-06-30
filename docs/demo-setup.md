# Velo Pay E2E Demo Guide

This guide describes how to run through a full, end-to-end demo of **Velo Pay** on the Stellar Testnet in under 5 minutes.

## Overview of the Flow

```txt
1. Merchant connects wallet & registers project on-chain (VeloRegistry)
2. Merchant activates Velo Pay access on-chain (VeloPayAccess)
3. Merchant generates an API Key and configures webhooks in the Dashboard
4. Customer opens the checkout page, connects wallet, and submits payment
5. Velo Pay monitors transaction, updates status, and delivers signed webhook
```

---

## Step 1: Merchant Onboarding & Registration

1. **Start the Application**: Ensure the monorepo is running locally via `pnpm dev`.
2. **Dashboard Registration**:
   - Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) and connect your developer wallet (Freighter).
   - Click **New Project** and input your project metadata (e.g., name, description, website).
   - Once the draft is created, click **Register On-Chain** to write the project identity and metadata hash to the `VeloRegistry` contract.
3. **Activate Payments**:
   - In the project detail view, click **Activate Velo Pay**.
   - This sends a transaction calling the `VeloPayAccess` smart contract.
   - On-chain, `VeloPayAccess` makes a cross-contract call to `VeloRegistry` to confirm the project exists, is active, and is owned by the calling address.
   - Once confirmed, the dashboard unlocks all payments functionality.

---

## Step 2: API Keys & Webhooks Configuration

1. **Generate API Key**:
   - Go to the **API Keys** tab in the project dashboard.
   - Click **Generate Key**, give it a label, and **copy the raw key**. Note that the raw key is only shown once; only the SHA-256 hash is saved in the database.
2. **Configure Webhook**:
   - Go to the **Webhooks** tab.
   - Click **Add Endpoint** and enter your receiver URL (e.g., a local server or webhook receiver tool like `webhook.site`).
   - Copy the webhook signing secret for signature validation.

---

## Step 3: Initiate a Payment Intent

1. **Copy SDK Snippet**:
   - Navigate to the **Integration** tab.
   - Copy the copy-pasteable JS/TS checkout snippet using your API key:
     ```ts
     import { createCheckoutSession } from "@repo/stellar";

     const session = await createCheckoutSession({
       apiKey: "tk_test_...", // Your generated API key
       amount: "10.00",
       asset: "native", // XLM
       description: "Demo payment",
       successUrl: "http://localhost:3000/pay/success",
       cancelUrl: "http://localhost:3000/pay/cancel",
     });

     console.log("Pay here:", session.checkoutUrl);
     ```
2. **Create Payment Intent**:
   - You can also click **Create Payment Link** directly in the dashboard UI under the **Payments** tab to generate a hosted checkout URL instantly.

---

## Step 4: Customer Checkout Experience

1. **Open Checkout Page**:
   - Visit the generated checkout URL: `/pay/[paymentIntentId]`.
2. **Payment Review**:
   - Connect the customer's wallet.
   - Verify the amount, merchant name, and asset to be paid.
   - *Insufficient Balance Check*: If the wallet has insufficient funds, a prominent error alert will display to prevent transaction failure.
3. **Submit Payment**:
   - Click **Pay Now** and sign the transaction in the wallet.
   - The UI immediately transitions to the **Payment Processing** screen, displaying the transaction hash and disabling further checkout actions to prevent duplicate submissions.
   - If the payment expires while reviewing, the page automatically locks out and displays a **Payment Expired** notice.

---

## Step 5: Observability & Webhook Deliveries

1. **RPC Confirmation**:
   - Velo Pay's monitor polls the Stellar RPC node to verify the transaction status.
   - Once confirmed, the payment status updates to `paid` in the database, and the checkout screen redirects to the Success page.
2. **Webhook Verification**:
   - A `payment.succeeded` event is generated and sent to the configured webhook endpoint.
   - The payload is signed using HMAC-SHA256 and sent with the `x-velo-signature` header.
   - In the project dashboard under the **Webhooks** tab, check the **Delivery Logs** to view the HTTP status, response latency, and payload verification status.
