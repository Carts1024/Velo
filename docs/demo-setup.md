# Velo Pay E2E Demo Guide

This guide describes how to run through a full, end-to-end demo of **Velo Pay** on the Stellar Testnet in under 5 minutes.

## Overview of the Flow

```txt
1. Merchant connects wallet & registers project on-chain (VeloRegistry)
2. Merchant activates Velo Pay access on-chain (VeloPayAccess)
3. Merchant generates an API key and configures webhooks in the project console
4. Customer opens the checkout page, connects wallet, and submits payment
5. Velo Pay monitors transaction, updates status, and delivers signed webhook
6. Merchant optionally settles through PDAX UAT quotes, trades, payouts, and settlement webhooks
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
   - Open the project detail view and use the API key controls.
   - Click **Generate Key**, give it a label, and **copy the raw key**. Note that the raw key is only shown once; only the SHA-256 hash is saved in the database.
2. **Configure Webhook**:
   - Open the project **Webhooks** page.
   - Save your receiver URL, enable the event types you want, and copy the webhook signing secret for signature validation.
   - Saving webhook settings and connecting settlement can auto-register the PDAX callback URL for UAT flows when the backend environment is configured.

---

## Step 3: Initiate a Payment Intent

1. **Copy SDK Snippet**:
   - Navigate to the **Integration** tab.
   - Copy the copy-pasteable JS/TS checkout snippet using your API key:
     ```ts
     import { Velo } from "@carts1024/velo-sdk";

     const velo = new Velo({
       apiKey: process.env.VELO_API_KEY!,
       environment: "testnet",
     });

     const session = await velo.checkout.sessions.create(
       {
         amount: "10.00",
         asset: "native", // XLM
         anchor: "pdax", // Optional V2 parameter: 'inhouse' | 'pdax'
         description: "Demo payment",
         successUrl: "http://localhost:3000/pay/demo/success",
         cancelUrl: "http://localhost:3000/pay/demo/cancel",
       },
       { idempotencyKey: "demo-payment-001" },
     );

     console.log("Pay here:", session.checkoutUrl);
     ```
2. **Create Payment Intent**:
   - You can also call the V2 endpoint `POST /api/v2/payment-intents` directly or use the project Integration page for SDK, cURL, Next.js, and fetch snippets.
   - To inspect existing intents, use `GET /api/v2/payment-intents` with optional `status`, `limit`, and `cursor` query parameters.

---

## Step 4: Customer Checkout Experience

1. **Open Checkout Page**:
   - Visit the generated checkout URL: `/pay/[paymentIntentId]`.
2. **Payment Review (V2 Enhancements)**:
   - Connect the customer's wallet.
   - Verify the amount, merchant name, and asset to be paid.
   - *Dynamic Labeling*: The UI automatically formats recipient details based on the intent's resolved anchor:
     - For `inhouse` anchors, it displays **Recipient Address** (the merchant owner's wallet).
     - For `pdax` anchors, it displays **PDAX Deposit Address** and requires a **Memo / Destination Tag** (which is constructed automatically into the Stellar transaction).
   - *Insufficient Balance Check*: If the wallet has insufficient funds, a prominent error alert will display to prevent transaction failure.
3. **Submit Payment**:
   - Click **Pay Now** and sign the transaction in the wallet. The transaction is securely built to include the memo tag if routed via `pdax`.
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

---

## Step 6: PDAX UAT Settlement & Payout Demo Flow

This step covers converting Stellar Testnet stablecoin payouts to local fiat currency and withdrawing to local banks.

> [!WARNING]
> This settlement flow uses the **PDAX UAT sandbox** environment. All rates, quotes, bank executions, and balances are simulated. Do not deposit real production assets.

1. **Connect Provider**:
   - Go to the **Settlement** tab in the project dashboard.
   - Click **Connect PDAX Provider** to authenticate Velo with the APAC Hackathon UAT credentials. Note that the dashboard caches token credentials securely in Convex.
2. **Review Sandbox Balances**:
   - Once connected, view the live sandbox asset balances. You can see available, hold, and total balances for `USDCXLM` (SEP-41 classic bridge token on Stellar testnet) and `PHP`.
3. **Execute Conversion Quote**:
   - Under **Step 1: Quote & Trade Conversion**, input a quantity (e.g. `10 USDCXLM`) and set target asset to `PHP`.
   - Click **Get Firm Quote** to request a locked executable UAT rate.
   - Click **Execute Conversion Trade** within 15 seconds to lock the trade and receive simulated `PHP` in your PDAX sandbox account.
4. **Initiate Payout Bank Withdrawal**:
   - Under **Step 2: Bank Withdrawal via InstaPay**, select a test destination bank (e.g., CTBC Bank `BACTBPH` or Security Bank `BASECPH`).
   - Input the test account details and click **Initiate InstaPay Withdrawal**. This will register a pending withdrawal transaction.
5. **Verify Outbound Webhooks**:
   - Use the callback simulator or wait for provider callbacks / payout polling.
   - Go to the webhook logs at the bottom to verify signed settlement events such as `settlement.quote.created`, `settlement.trade.executed`, `settlement.withdrawal.pending`, `settlement.withdrawal.succeeded`, and `provider.pdax.event.received`.

---

## Step 7: Presentation Offline Fallback Guide

If the live PDAX UAT API goes down or resets:
1. Use the **Webhook Simulator** widget on the Settlement page to trigger simulated callbacks manually.
2. Provide a reference ID (e.g. `w-idemp-mock123`), select state `COMPLETED` or `FAILED`, and click **Trigger Callback Webhook**.
3. Velo will bypass network dependency, mutate the database record to `PAYOUT_SUCCEEDED` or `PAYOUT_FAILED`, dispatch the normalized merchant webhook, and log delivery metrics in the dashboard.

