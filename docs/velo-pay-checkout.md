# Velo Pay Checkout Guide

This guide explains how to create a Velo Pay payment intent, send a buyer to the hosted checkout page, and use the paid intent as the starting point for optional PDAX UAT settlement.

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

## Payment Anchors and Routing (V2)

Velo Pay V2 (`/api/v2/payment-intents`) introduces anchor-aware payment routing with support for `inhouse` (default) and `pdax` anchors.

### Anchor Scoping and Precedence Rules

When creating a payment intent, the routing anchor is resolved deterministically based on the following precedence hierarchy:

1. **Explicit Request Parameter**: If a request explicitly specifies `anchor: "inhouse"` or `anchor: "pdax"`, that value is used.
   * *Security check*: If the API key used for the request is scoped to a specific anchor, the requested `anchor` **must** match the API key's scoped `paymentAnchor`, otherwise the request will fail with an anchor mismatch validation error.
2. **API Key Scope**: If the request omits the `anchor` parameter, the payment routing falls back to the API key's scoped `paymentAnchor` value (`"inhouse"` or `"pdax"`), if one is configured for the key.
3. **Project Default**: If the API key is not scoped, the routing falls back to the Project's `defaultPaymentAnchor` settings (`"inhouse"` or `"pdax"`), configured in the project settings.
4. **System Default**: If no explicit request, API key scope, or project default is configured, Velo defaults to `"inhouse"`.

### Database Configuration (Sprint 1: Foundation)
The database schema has been updated to support anchor resolution:
* `projects.defaultPaymentAnchor`: `"inhouse" | "pdax"` (defaults to `"inhouse"`).
* `apiKeys.paymentAnchor`: `"inhouse" | "pdax"` (allows API keys to be scoped to a single anchor path).
* `paymentIntents.anchor`: `"inhouse" | "pdax"` (stores the resolved anchor on the intent).
* `paymentIntents.receiverMemo`: `string` (stores the memo tag, required for PDAX deposit validation).
* `paymentIntents.anchorDepositCurrency`: `string` (stores the currency code mapped for deposit lookups).

### API V1 Backward Compatibility
`/api/v1/payment-intents` continues to function exactly as before, with all creations defaulting to the `inhouse` flow.


## Read Payment Intents

The API also supports server-side reads with the same API key authentication:

```http
GET /api/v1/payment-intents?status=paid&limit=10
GET /api/v1/payment-intents/{id}
Authorization: Bearer tk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Use these endpoints directly or through `@carts1024/velo-sdk`:

```ts
const intent = await velo.paymentIntents.retrieve("pi_12345");
const paidPage = await velo.paymentIntents.list({ status: "paid", limit: 10 });
```

List responses include `data`, `hasMore`, and `nextCursor` for pagination.

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

## Receiver Address and Memo

For `inhouse` routing:
* The API request does not accept `receiverAddress`.
* Velo always sets `receiverAddress` to the `project.ownerAddress` for security.
* This prevents a leaked API key or bad client request from redirecting funds to a different wallet. To change the receiver, create or use a project whose `ownerAddress` is the desired receiver.

For `pdax` routing (implemented in future slices):
* Velo performs a secure, server-side deposit destination lookup against PDAX.
* The resolved deposit address is stored as `receiverAddress`.
* The returned destination tag is stored as `receiverMemo` (as a Stellar memo tag), which is required to prevent lost deposits.
* If the PDAX lookup fails, the API returns `503 anchor_unavailable` and prevents checkout session creation.


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

## Optional Settlement After Payment

After a PaymentIntent reaches `paid`, Velo Settlement can use it as evidence for a PDAX UAT settlement demo:

1. Open the project Settlement page.
2. Connect the PDAX UAT provider.
3. Review searchable/sortable sandbox balances.
4. Request an indicative or firm quote for `USDCXLM` to `PHP`. Firm quotes are executable for about 15 seconds.
5. Execute the trade while the quote is active.
6. Initiate an InstaPay UAT withdrawal to a supported sandbox bank.
7. Let the provider callback or payout polling update the settlement transaction.
8. Verify signed merchant webhook deliveries such as `settlement.quote.created`, `settlement.trade.executed`, `settlement.withdrawal.pending`, and `settlement.withdrawal.succeeded`.

PDAX callbacks enter Velo through `POST /api/webhooks/pdax`, are deduplicated in Convex provider event records, and are normalized before merchant webhooks are sent.

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
