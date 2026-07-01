# Velo Pay Checkout Guide

This guide explains how to create a Velo Pay payment intent and send a buyer to the hosted checkout page.

## Overview

Velo Pay uses three pieces:

1. Merchant calls `POST /api/v1/payment-intents` with an API key.
2. Velo creates a payment intent in Convex and returns a hosted checkout URL.
3. Buyer opens the checkout URL, connects a Stellar wallet, signs, and submits a Stellar payment transaction.

```mermaid
sequenceDiagram
  participant Merchant
  participant VeloAPI as Velo API
  participant Convex
  participant Buyer
  participant Stellar

  Merchant->>VeloAPI: POST /api/v1/payment-intents
  VeloAPI->>Convex: createPaymentIntent(apiKeyHash, amount, asset)
  Convex-->>VeloAPI: paymentIntentId
  VeloAPI-->>Merchant: checkoutUrl
  Merchant->>Buyer: Redirect to checkoutUrl
  Buyer->>VeloAPI: Open /pay/{paymentIntentId}
  Buyer->>Stellar: Sign and submit payment
  Buyer->>Convex: Mark intent pending with tx hash
  Convex->>Stellar: Scanner verifies transaction
  Convex->>Convex: Mark intent paid or failed
```

## Prerequisites

- Project has payment access active.
- Project has an API key with prefix `tk_live_`.
- `NEXT_PUBLIC_CONVEX_URL` points to the same Convex deployment that stores the project and API key.
- `NEXT_PUBLIC_APP_URL` points to the web app origin used in checkout links.
- `NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID` points to the deployed Testnet pay-access contract for web activation flows.
- `VELO_PAY_ACCESS_CONTRACT_ID` is set in Convex/backend for pay-access event sync.
- Buyer wallet is on Stellar Testnet.
- Receiver account exists on Stellar Testnet.

For non-native assets such as USDC:

- Receiver account must have a trustline for that asset.
- Buyer account must have a trustline for that asset.
- Buyer account must hold enough balance of that asset.

## Create a Payment Intent

Endpoint:

```http
POST /api/v1/payment-intents
Authorization: Bearer tk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

Minimum XLM example:

```bash
curl -X POST http://localhost:3000/api/v1/payment-intents \
  -H "Authorization: Bearer tk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "10.00",
    "asset": "native",
    "description": "Test payment"
  }'
```

USDC example:

```bash
curl -X POST http://localhost:3000/api/v1/payment-intents \
  -H "Authorization: Bearer tk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "10.00",
    "description": "Order #1001",
    "successUrl": "https://merchant.example/success",
    "cancelUrl": "https://merchant.example/cancel"
  }'
```

Successful response:

```json
{
  "paymentIntentId": "k17...",
  "checkoutUrl": "http://localhost:3000/pay/k17...",
  "expiresIn": 1800
}
```

Send the buyer to `checkoutUrl`.

## Request Body

| Field | Required | Example | Notes |
| --- | --- | --- | --- |
| `amount` | Yes | `"10.00"` | Decimal string. Must be positive. |
| `asset` | No | `"native"` | Use `"native"` or `"CODE:ISSUER"`. If omitted, app uses configured checkout asset. |
| `description` | No | `"Order #1001"` | Shown on checkout page. |
| `successUrl` | No | `"https://merchant.example/success"` | Used by success page redirect. |
| `cancelUrl` | No | `"https://merchant.example/cancel"` | Used by cancel and failed page redirect. |

## Asset Defaults

`apps/web/core/config/stellar.ts` resolves the default checkout asset:

- If `NEXT_PUBLIC_USDC_ISSUER` is set, default asset is `USDC:{issuer}`.
- If `NEXT_PUBLIC_USDC_ISSUER` is not set, default asset is `native`.

For simple Testnet testing, send `"asset": "native"` explicitly. This creates an XLM payment and avoids USDC trustline setup.

## Receiver Address

The API request does not accept `receiverAddress`.

Velo always sets:

```ts
receiverAddress: project.ownerAddress
```

This is intentional. It prevents a leaked API key or bad client request from redirecting funds to a different wallet.

To change the receiver, create or use a project whose `ownerAddress` is the desired receiver.

## Checkout Flow

Hosted checkout page:

```text
/pay/{paymentIntentId}
```

Buyer flow:

1. Opens checkout URL.
2. Connects Stellar wallet.
3. Reviews amount, asset, network, receiver, and wallet address.
4. Clicks pay.
5. App preflights:
   - payer and receiver are different
   - amount is positive
   - receiver account exists
   - trustlines exist for non-native asset
   - payer has enough asset balance
6. Wallet signs transaction.
7. App marks payment intent `pending`.
8. App submits transaction to Horizon.
9. App keeps the intent `pending` while Velo verifies the transaction.
10. The backend scanner confirms the transaction over RPC and marks the intent `paid` or `failed`.

## Payment Statuses

| Status | Meaning |
| --- | --- |
| `created` | Intent exists, checkout available. |
| `pending` | Buyer signed, a transaction hash was recorded, and Velo is verifying settlement. |
| `paid` | Backend scanner confirmed the Stellar transaction succeeded. |
| `failed` | Submission failed after pending state. |
| `cancelled` | Buyer cancelled checkout. |
| `expired` | Intent passed expiry time. |

Default expiry is 30 minutes.

## Local Development Checklist

Use matching Convex deployments:

```env
# apps/web/.env.local
NEXT_PUBLIC_CONVEX_URL=https://brainy-labrador-583.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://brainy-labrador-583.convex.site
NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID=CBSR5LFHR5Q2X3PO3HSMGXI43YEUYGFTHUPGNVGW6XH2VNOQUEUHIEJR
NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID=CBHDLZYSYWETHPC6KDGH35S4SNBU5P7QWLNNDWYXJRHZMZDTQSKYVOXJ

# packages/backend/.env.local
CONVEX_URL=https://brainy-labrador-583.convex.cloud
CONVEX_SITE_URL=https://brainy-labrador-583.convex.site
VELO_PAY_ACCESS_CONTRACT_ID=CBHDLZYSYWETHPC6KDGH35S4SNBU5P7QWLNNDWYXJRHZMZDTQSKYVOXJ
```

After changing Convex functions:

```bash
pnpm --filter @repo/backend exec convex dev --once
```

After changing `.env.local` or checkout code:

```bash
pnpm --filter web dev
```

Restart the web dev server so Next.js reloads env vars and package changes.

## Troubleshooting

### `Internal Server Error: [Request ID: ...] Server Error`

Common causes:

- Web app points to wrong Convex deployment.
- Convex deployment does not have latest functions.
- API key was created in a different deployment.
- Project payment access is inactive.

Fix:

1. Confirm `apps/web/.env.local` and `packages/backend/.env.local` use same Convex deployment.
2. Push Convex functions:

   ```bash
   pnpm --filter @repo/backend exec convex dev --once
   ```

3. Restart web dev server.
4. Generate a new API key from the current deployment if needed.

### `Request failed with status code 400`

This comes from Horizon during transaction submission.

Common causes:

- Buyer lacks asset trustline.
- Receiver lacks asset trustline.
- Buyer lacks asset balance.
- Receiver account does not exist.
- Wallet signed for wrong Stellar network.

Fast test path:

```bash
curl -X POST http://localhost:3000/api/v1/payment-intents \
  -H "Authorization: Bearer tk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "10.00",
    "asset": "native",
    "description": "Test XLM payment"
  }'
```

Then open returned `checkoutUrl`.

### `Receiver account does not have a trustline for USDC`

Receiver/project owner account needs a USDC trustline before it can receive USDC.

Options:

- Use `"asset": "native"` for XLM testing.
- Add the USDC trustline to the receiver wallet.

### `Connected wallet does not have a trustline for USDC`

Buyer wallet needs a USDC trustline before it can send USDC.

Options:

- Use `"asset": "native"` for XLM testing.
- Add the USDC trustline to the buyer wallet.

### `Connected wallet does not have enough USDC balance`

Buyer wallet has trustline but not enough USDC.

Options:

- Fund buyer wallet with the selected asset.
- Use smaller amount.
- Use `"asset": "native"` if testing with XLM.

## Security Notes

- Never expose raw API keys in browser code.
- Use API keys only from merchant server-side code or trusted local testing.
- Receiver address is derived from project ownership, not request body.
- Payment links expire after 30 minutes.
- Non-native asset payments require trustlines on both payer and receiver accounts.

## Relevant Files

- `apps/web/app/api/v1/payment-intents/route.ts`
- `apps/web/features/checkout/checkout-client.tsx`
- `packages/backend/convex/payment_intents/mutations.ts`
- `packages/backend/convex/payment_intents/queries.ts`
- `packages/stellar/src/checkout.ts`
