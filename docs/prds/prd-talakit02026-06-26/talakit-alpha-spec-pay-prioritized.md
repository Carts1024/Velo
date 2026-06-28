# TalaKit Alpha Specification — Pay-Prioritized Revision

Generated: 2026-06-29  
Status: Revised Alpha plan focused on **Stablecoin Payment Links + Checkout SDK + Webhooks**  
Primary goal: Demo-ready hackathon Alpha, not full production-grade infrastructure

---

## 1. Product Overview

**TalaKit Alpha** is a developer-first stablecoin payment infrastructure layer for Stellar builders.

Instead of positioning the Alpha as a broad “all-in-one developer operations platform,” this revision focuses the Alpha around **TalaKit Pay**:

- Stablecoin payment links
- Hosted checkout page
- Checkout SDK
- Payment status tracking
- Payment webhooks
- Payment dashboard and delivery logs
- Verified project/merchant registry using Soroban smart contracts
- Demo-friendly transaction debugger and event monitoring

### One-line pitch

> TalaKit Pay lets Stellar developers accept stablecoin payments with a payment link, a few lines of SDK code, and real-time webhooks when payments succeed.

### Alpha goal

The Alpha should prove that developers can integrate Stellar stablecoin payments into their app quickly. For the hackathon, the product does not need to be production-ready; it must be functional, coherent, and demoable end-to-end.

---

## 2. Revised Alpha Direction

The previous Alpha plan prioritized RPC gateway, event indexer, transaction debugger, project registry, and webhooks equally. This revision changes the priority:

### New Alpha priority

1. **Stablecoin Payment Links**
2. **Checkout SDK**
3. **Payment Webhooks**
4. **PaymentIntent dashboard**
5. **Verified project/merchant registry**
6. **Payment transaction debugger**
7. **Basic event/payment monitor**
8. **Demo polish and mobile responsiveness**

### Deferred or reduced scope

These are not removed from TalaKit forever, but they should not block the hackathon Alpha:

- Full RPC gateway
- Advanced request logging
- Rate limiting
- Multi-key API management
- Full contract explorer
- Advanced visual debugger
- Full-network indexer
- Mainnet-grade production hardening
- Billing system
- Team accounts

---

## 3. Mandatory Requirements for This Alpha

For this revised Alpha, TalaKit must satisfy:

- Functional demo of stablecoin payment link creation
- Functional hosted checkout/payment page
- Functional SDK helper or copy-paste code snippet
- Functional webhook configuration and payment webhook delivery
- Payment status dashboard
- Wallet connection
- Stable frontend architecture
- Mobile-responsive UI
- Proper loading states
- Proper error handling
- At least 2 smart contracts with a meaningful inter-contract call, if still required by the hackathon
- Testnet deployment and demo run-through

### Hackathon interpretation

Because the hackathon does not require production readiness, production-grade SLA, multi-provider RPC failover, and full API rate limiting are not Alpha blockers. The priority is to show a working product that proves the stablecoin payment flow.

---

## 4. Target Users

TalaKit Alpha is for:

- Developers building Stellar payment apps
- Hackathon teams that want to accept stablecoin payments
- Freelancers and small businesses that want payment links
- SaaS apps that need wallet-based checkout
- DeFi builders needing payment confirmation webhooks
- Stablecoin and remittance app developers
- Projects that want verified merchant/project pages

---

## 5. Core Product Flow

```txt
Developer connects wallet
    ↓
Creates a TalaKit project / merchant profile
    ↓
Registers the project on-chain using TalaKitRegistry
    ↓
Activates payment access using TalaKitPayAccess
    ↓
TalaKitPayAccess calls TalaKitRegistry to verify the project exists and is active
    ↓
Developer configures receiver wallet, accepted asset, and webhook URL
    ↓
Developer creates a PaymentIntent or uses the Checkout SDK
    ↓
TalaKit generates a hosted payment link
    ↓
Customer opens the payment link and connects wallet
    ↓
Customer sends stablecoin payment on Stellar Testnet
    ↓
TalaKit tracks the transaction and marks the PaymentIntent as paid
    ↓
TalaKit sends a payment.succeeded webhook to the developer backend
    ↓
Developer views payment status and webhook delivery logs in the dashboard
```

---

## 6. Core Alpha Feature Set

## 6.1 Wallet Connection

Users must be able to connect a Stellar wallet.

Recommended wallet:

- Freighter

Required states:

- Not connected
- Connecting
- Connected
- Connection rejected
- Wrong network
- Wallet unavailable

Required UI behavior:

- Show wallet address after connection
- Show active network
- Disable payment/project actions if wallet is not connected
- Show clear error messages when connection fails

---

## 6.2 Project / Merchant Dashboard

Developers must be able to create and manage a TalaKit project that acts as a merchant profile for accepting stablecoin payments.

Project fields:

```txt
Project {
  id: string,
  slug: string,
  name: string,
  description: string,
  website_url: string | null,
  github_url: string | null,
  owner_wallet: string,
  receiver_wallet: string,
  accepted_assets: string[],
  network: "testnet",
  metadata_hash: string,
  onchain_project_id: string | null,
  verification_status: "draft" | "pending" | "registered" | "error",
  payment_access_status: "inactive" | "active",
  created_at: Date,
  updated_at: Date
}
```

Dashboard should show:

- Project cards
- Verification status
- Payment access status
- Receiver wallet
- Accepted stablecoin asset
- Payment link count
- Successful payment count
- Webhook status
- Recent payments

Required states:

- Loading projects
- No projects yet
- Project creation loading
- Project creation failed
- Project created successfully

---

## 6.3 Stablecoin Payment Links

### Purpose

Payment Links let developers or merchants create a shareable checkout URL for a fixed stablecoin payment.

Example:

```txt
https://pay.talakit.xyz/pay/pi_123
```

### Required behavior

Developer can create a payment link with:

- Project ID
- Amount
- Asset code, for example USDC or test asset
- Receiver wallet
- Description
- Optional customer reference
- Optional success URL
- Optional cancel URL
- Expiration time

### Payment link states

```txt
created
pending
paid
failed
expired
cancelled
```

### Payment link UI

The hosted payment page should show:

- Merchant/project name
- Amount
- Asset
- Receiver wallet
- Payment description
- Connect wallet button
- Pay button
- Payment status
- Copy transaction hash after payment
- Success screen
- Failure screen

### Required error handling

- Wallet not connected
- Wrong network
- Invalid amount
- Missing receiver wallet
- Unsupported asset
- Payment expired
- Transaction rejected
- Transaction failed
- Payment already completed

---

## 6.4 Checkout SDK

### Purpose

The Checkout SDK makes TalaKit Pay easy to integrate with a few lines of code.

### Developer-facing API

For the Alpha, the SDK can be a small TypeScript package or a copy-paste helper exported from the monorepo.

Example:

```ts
import { createCheckout } from "@talakit/checkout";

const checkout = await createCheckout({
  apiKey: "tk_test_...",
  amount: "10",
  asset: "USDC",
  description: "Alpha demo payment",
  customerReference: "order_123",
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel",
});

window.location.href = checkout.url;
```

### SDK responsibilities

- Call TalaKit API to create a PaymentIntent
- Return hosted checkout URL
- Optionally return PaymentIntent ID
- Optionally provide a helper to verify webhook signatures
- Hide Stellar/RPC complexity from the developer

### Minimum SDK functions

```ts
createCheckout(options)
retrievePaymentIntent(paymentIntentId)
verifyWebhookSignature(payload, signature, secret)
```

### Acceptance criteria

The demo should show that a developer can integrate checkout by copying a short snippet into a sample app.

---

## 6.5 PaymentIntent System

### Purpose

The PaymentIntent is the core backend object that tracks a requested payment from creation to completion.

### PaymentIntent model

```txt
PaymentIntent {
  id: string,
  project_id: string,
  amount: string,
  asset_code: string,
  asset_issuer: string | null,
  receiver_wallet: string,
  payer_wallet: string | null,
  description: string | null,
  customer_reference: string | null,
  status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled",
  checkout_url: string,
  success_url: string | null,
  cancel_url: string | null,
  transaction_hash: string | null,
  ledger: number | null,
  paid_at: Date | null,
  expires_at: Date | null,
  created_at: Date,
  updated_at: Date
}
```

### Required backend behavior

- Create PaymentIntent
- Generate checkout URL
- Store status
- Update status when payment is submitted
- Confirm payment transaction through Stellar RPC
- Mark as paid only when the transaction is confirmed
- Trigger webhook after payment success or failure

### Alpha simplification

For the hackathon demo, payment detection can be implemented by confirming the transaction submitted through the hosted checkout page. A full background scanner for all incoming wallet payments is optional.

---

## 6.6 Payment Webhooks

### Purpose

Payment webhooks notify the developer’s backend when a payment changes status.

### Supported webhook events

```txt
payment.created
payment.pending
payment.succeeded
payment.failed
payment.expired
checkout.completed
project.registered
payment_access.activated
```

### Required webhook features

- Add webhook URL
- Enable/disable webhook
- Select event types
- Test webhook button
- Delivery logs
- At least one automatic payment webhook
- Optional HMAC signing for Alpha; recommended if time allows

### Recommended webhook headers

```txt
x-talakit-event: payment.succeeded
x-talakit-delivery-id: whd_123
x-talakit-signature: hmac_sha256_signature
```

### Example payment.succeeded payload

```json
{
  "type": "payment.succeeded",
  "paymentIntentId": "pi_123",
  "projectId": "proj_123",
  "amount": "10",
  "asset": "USDC",
  "receiver": "G_RECEIVER...",
  "payer": "G_PAYER...",
  "transactionHash": "abc123",
  "ledger": 123456,
  "status": "paid",
  "customerReference": "order_123",
  "timestamp": "2026-06-29T00:00:00.000Z"
}
```

### WebhookDelivery model

```txt
WebhookDelivery {
  id: string,
  webhook_id: string,
  project_id: string,
  payment_intent_id: string | null,
  event_type: string,
  payload_summary: JSON,
  status: "delivered" | "failed" | "pending",
  http_status: number | null,
  response_time_ms: number | null,
  failure_reason: string | null,
  attempt_count: number,
  created_at: Date,
  last_attempt_at: Date | null
}
```

### Required states

- Creating webhook
- Testing webhook
- Webhook delivered
- Webhook failed
- Invalid webhook URL
- Webhook disabled
- No deliveries yet

---

## 6.7 Soroban Smart Contract Architecture

The Alpha should keep the 2-contract requirement but make it payment-relevant.

Recommended contracts:

1. `TalaKitRegistry`
2. `TalaKitPayAccess`

### Contract 1: TalaKitRegistry

Purpose:

The Registry contract stores the verified project/merchant identity for TalaKit Pay.

It proves:

- A project exists
- A wallet owns the project
- The project has official receiver wallet metadata
- The project metadata hash was registered on-chain
- The project is active or inactive

Core functions:

```rust
register_project(name, metadata_hash)
update_project(project_id, metadata_hash)
add_contract(project_id, contract_id)
remove_contract(project_id, contract_id)
transfer_ownership(project_id, new_owner)
deactivate_project(project_id)
get_project(project_id)
get_project_contracts(project_id)
is_project_active(project_id)
```

Alpha note:

The current `TalaKitRegistry` can remain mostly unchanged. The payment-specific data such as receiver wallet and accepted asset can live off-chain in Convex for demo speed, while the metadata hash anchors the project identity on-chain.

### Contract 2: TalaKitPayAccess

Purpose:

`TalaKitPayAccess` activates payment access for a verified project and satisfies the inter-contract call requirement in a useful way.

Core functions:

```rust
activate_payments(project_id)
deactivate_payments(project_id)
consume_checkout_credit(project_id, amount)
get_payment_access_status(project_id)
get_checkout_credits(project_id)
```

Required inter-contract behavior:

```txt
User calls TalaKitPayAccess.activate_payments(project_id)
    ↓
TalaKitPayAccess calls TalaKitRegistry.get_project(project_id)
    ↓
Registry returns project data
    ↓
PayAccess checks project exists, active, and caller is owner
    ↓
PayAccess activates checkout/payment access for that project
```

PayAccess data:

```txt
PayAccess {
  project_id: u64,
  active: bool,
  checkout_credits: u64,
  activated_at_ledger: u32
}
```

Required checks:

- Project must exist in Registry
- Project must be active
- Caller must be the project owner
- Payment access status should be queryable by project ID

Alpha simplification:

`consume_checkout_credit` can be used only for demo tracking and does not need real billing.

---

## 6.8 API Keys

Each project should support a developer API key used by the Checkout SDK.

### Required features

- Generate API key
- Show raw API key only once
- Store only hashed API key
- Revoke API key
- Use API key to create PaymentIntents
- Optional: show last used timestamp and request count

### APIKey model

```txt
APIKey {
  id: string,
  project_id: string,
  key_hash: string,
  prefix: string,
  label: string,
  created_at: Date,
  last_used_at: Date | null,
  request_count: number,
  revoked: bool
}
```

### Alpha simplification

If the current project-level API key already works, it can be reused for the demo. A dedicated `APIKey` table is recommended but not required unless implementation time allows.

---

## 6.9 Payment API Routes

### Required routes

```txt
POST /api/v1/payment-intents
GET /api/v1/payment-intents/:id
POST /api/v1/payment-intents/:id/confirm
POST /api/v1/webhooks/test
GET /api/v1/webhooks/deliveries
```

### Optional routes

```txt
POST /api/v1/checkout/sessions
GET /api/v1/checkout/sessions/:id
POST /api/v1/payment-intents/:id/cancel
POST /api/v1/payment-intents/:id/expire
```

### Public checkout routes

```txt
/pay/:paymentIntentId
/pay/:paymentIntentId/success
/pay/:paymentIntentId/cancel
```

### Dashboard routes

```txt
/dashboard/projects/:projectId/payments
/dashboard/projects/:projectId/payments/new
/dashboard/projects/:projectId/payments/:paymentIntentId
/dashboard/projects/:projectId/checkout
/dashboard/projects/:projectId/webhooks
/dashboard/projects/:projectId/api-keys
```

---

## 6.10 Payment Transaction Monitor

### Purpose

The payment monitor confirms that a payment transaction was submitted and succeeded.

### Required behavior

- Store transaction hash after checkout payment submission
- Fetch transaction status from Stellar RPC
- Decode basic payment or contract transaction details where possible
- Update PaymentIntent status
- Trigger payment webhooks

### Alpha simplification

Do not build a full universal indexer yet. For the demo, only track transactions created from TalaKit checkout.

---

## 6.11 Transaction Debugger for Payments

The debugger should be scoped around payments.

### Inputs

- Transaction hash
- PaymentIntent ID, optional
- Project ID, optional

### Output

- Transaction status
- Ledger number
- Fee
- Created timestamp
- PaymentIntent status
- Payer wallet
- Receiver wallet
- Amount
- Asset
- Error code
- Human-readable explanation
- Raw response toggle

### Required states

- Waiting for transaction hash
- Loading transaction
- Transaction not found
- Invalid transaction hash
- Failed to fetch transaction
- Transaction pending
- Transaction failed
- Transaction successful

---

## 6.12 Payment Dashboard

The payment dashboard should show:

- Total PaymentIntents
- Paid PaymentIntents
- Pending PaymentIntents
- Failed PaymentIntents
- Total paid amount
- Recent payments
- Recent webhook deliveries
- API/SDK integration snippet

### Payment table columns

```txt
PaymentIntent ID
Amount
Asset
Status
Payer
Transaction Hash
Created At
Paid At
Actions
```

### Actions

- Copy payment link
- Open payment link
- View payment details
- Send test webhook
- Copy SDK snippet
- Copy webhook payload sample

---

## 6.13 Developer Integration Page

Each project should have a checkout integration page.

It should show:

- API key status
- Create API key button
- SDK install command
- Minimal checkout code snippet
- Webhook endpoint setup
- Webhook secret/signature instructions, if implemented
- Test mode badge
- Sample payment link

Example snippet:

```ts
import { createCheckout } from "@talakit/checkout";

const checkout = await createCheckout({
  apiKey: process.env.TALAKIT_API_KEY!,
  amount: "10",
  asset: "USDC",
  description: "Demo payment",
  customerReference: "order_123"
});

window.location.href = checkout.url;
```

---

## 7. Frontend Requirements

Recommended stack:

- Next.js
- TypeScript
- Tailwind CSS
- Existing UI components
- Freighter wallet integration

### Required pages

```txt
/
/dashboard
/dashboard/projects
/dashboard/projects/new
/dashboard/projects/:projectId
/dashboard/projects/:projectId/payments
/dashboard/projects/:projectId/payments/new
/dashboard/projects/:projectId/checkout
/dashboard/projects/:projectId/webhooks
/dashboard/projects/:projectId/api-keys
/pay/:paymentIntentId
/debug
/verify/:slug
```

### Required states

Every async action must have:

- Loading state
- Success state
- Error state
- Empty state, when applicable

Important examples:

- Connecting wallet
- Registering project
- Activating payment access
- Creating payment link
- Loading checkout page
- Submitting payment
- Confirming payment
- Creating webhook
- Testing webhook
- Sending webhook
- Creating API key

### Mobile requirements

- Payment page must work well on mobile
- Pay button must be easy to tap
- Wallet address and transaction hash should truncate with copy button
- Dashboard tables can become cards or horizontally scroll
- Payment status should be visually obvious

---

## 8. Backend Requirements

Use the current Convex + Next.js architecture where possible.

### Backend services

```txt
Project Service
PaymentIntent Service
Checkout API
Webhook Worker
Payment Transaction Monitor
API Key Service
Debugger Service
```

### Required backend capabilities

- Create PaymentIntent
- Generate hosted checkout URL
- Validate API key
- Submit or confirm Stellar transaction
- Store payment status
- Trigger webhook event
- Store webhook delivery logs
- Return payment details for dashboard and checkout page

---

## 9. Database Models

### Project

```txt
Project {
  id: string,
  slug: string,
  onchain_project_id: string | null,
  owner_wallet: string,
  receiver_wallet: string | null,
  name: string,
  description: string,
  website_url: string | null,
  github_url: string | null,
  metadata_hash: string,
  network: "testnet",
  active: bool,
  verified: bool,
  payment_access_active: bool,
  created_at: Date,
  updated_at: Date
}
```

### PaymentIntent

```txt
PaymentIntent {
  id: string,
  project_id: string,
  amount: string,
  asset_code: string,
  asset_issuer: string | null,
  receiver_wallet: string,
  payer_wallet: string | null,
  description: string | null,
  customer_reference: string | null,
  status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled",
  checkout_url: string,
  success_url: string | null,
  cancel_url: string | null,
  transaction_hash: string | null,
  ledger: number | null,
  failure_reason: string | null,
  paid_at: Date | null,
  expires_at: Date | null,
  created_at: Date,
  updated_at: Date
}
```

### APIKey

```txt
APIKey {
  id: string,
  project_id: string,
  key_hash: string,
  prefix: string,
  label: string,
  last_used_at: Date | null,
  request_count: number,
  revoked: bool,
  created_at: Date
}
```

### WebhookEndpoint

```txt
WebhookEndpoint {
  id: string,
  project_id: string,
  url: string,
  secret_hash: string | null,
  enabled: bool,
  event_types: string[],
  created_at: Date,
  updated_at: Date
}
```

### WebhookDelivery

```txt
WebhookDelivery {
  id: string,
  webhook_id: string,
  project_id: string,
  payment_intent_id: string | null,
  event_type: string,
  payload_summary: JSON,
  status: "delivered" | "failed" | "pending",
  http_status: number | null,
  response_time_ms: number | null,
  failure_reason: string | null,
  attempt_count: number,
  created_at: Date,
  last_attempt_at: Date | null
}
```

---

## 10. Revised Alpha Timeline

## Week 1: Payment Foundation

Build:

- PaymentIntent schema
- Create PaymentIntent API
- Payment dashboard page
- Create payment link form
- Hosted checkout route
- Receiver wallet configuration
- Basic payment status states

Deliverable:

```txt
Developer can create a payment link and open a hosted checkout page.
```

---

## Week 2: Checkout Payment Flow

Build:

- Checkout wallet connection
- Stablecoin/test asset payment transaction flow
- Transaction submission
- Payment confirmation
- Status update to paid/failed
- Payment success screen
- Payment details screen

Deliverable:

```txt
Customer can open a payment link, pay on Stellar Testnet, and see a success state.
```

---

## Week 3: Webhooks + SDK

Build:

- payment.succeeded webhook
- payment.failed webhook
- Webhook delivery logs
- Test webhook button
- Basic webhook signature if time allows
- `@talakit/checkout` SDK helper or copy-paste client helper
- Integration snippet page

Deliverable:

```txt
Developer can create checkout with a few lines of code and receive a webhook when payment succeeds.
```

---

## Week 4: Smart Contract Requirement + Demo Hardening

Build:

- Keep existing `TalaKitRegistry`
- Build `TalaKitPayAccess` or adapt `TalaKitAccessPass`
- Inter-contract call from PayAccess to Registry
- Payment access activation UI
- Testnet deployment IDs
- Full demo run-through
- Mobile and error-state polish

Deliverable:

```txt
Developer can register a project, activate payment access through a second contract, create a payment link, receive payment, and receive a webhook.
```

---

## Week 5: Optional Enhancements

Only build these if the core demo is already stable:

- API key request count and last-used tracking
- PaymentIntent expiration cron
- Retry failed webhooks
- Payment transaction debugger improvements
- Public merchant verification page improvements
- Basic payment analytics cards
- Event monitor for payment events

---

## 11. Revised Alpha Acceptance Criteria

The Alpha is complete when this demo works end-to-end:

```txt
1. Developer opens TalaKit.
2. Developer connects Freighter wallet on Testnet.
3. Developer creates a TalaKit project / merchant profile.
4. Developer registers the project on-chain using TalaKitRegistry.
5. Developer activates payment access using TalaKitPayAccess.
6. TalaKitPayAccess calls TalaKitRegistry to verify the project exists and is active.
7. Developer configures receiver wallet and accepted stablecoin/test asset.
8. Developer generates an API key.
9. Developer creates a PaymentIntent from the dashboard or SDK.
10. TalaKit generates a hosted payment link.
11. Customer opens the payment link.
12. Customer connects wallet and submits stablecoin payment.
13. TalaKit confirms the transaction and marks the PaymentIntent as paid.
14. TalaKit sends a payment.succeeded webhook.
15. Developer sees payment status and webhook delivery logs in the dashboard.
16. Developer copies a Checkout SDK snippet showing the same flow in a few lines of code.
17. Public verify page shows the project as a verified TalaKit Pay merchant.
```

---

## 12. What Not to Build Yet

Do not include these in the hackathon Alpha unless all core payment features are stable:

- Full mainnet-grade RPC gateway
- Advanced RPC usage analytics
- Full-network Stellar indexer
- Advanced transaction visual debugger
- Billing system
- Team accounts
- Marketplace
- Token launch
- Multi-chain support
- Complex DeFi routing
- Pay-with-any-asset path payment routing
- Custodial escrow
- Fiat off-ramp/on-ramp integrations
- Compliance/KYC layer

---

## 13. Final Alpha Positioning

Use this as the revised product description:

> TalaKit Pay is a developer-first stablecoin payment layer for Stellar. It lets builders create payment links, embed checkout with a few lines of code, and receive real-time webhooks when payments succeed, while TalaKit handles transaction tracking, project verification, and payment observability.

---

## 14. Final Build Priority

If time is limited, prioritize in this order:

1. PaymentIntent schema
2. Create payment link form
3. Hosted checkout page
4. Wallet payment flow
5. Payment confirmation/status update
6. payment.succeeded webhook
7. Webhook delivery logs
8. Checkout SDK/helper snippet
9. Project receiver wallet setup
10. API key for SDK
11. Existing Registry live deployment
12. PayAccess/AccessPass second contract
13. Inter-contract call
14. Payment access activation UI
15. Payment dashboard polish
16. Mobile responsiveness
17. Testnet demo script
18. README and pitch materials

---

## 15. Demo Script

```txt
Demo Part 1: Developer setup
- Connect Freighter
- Create TalaKit Pay project
- Register project on-chain
- Activate payment access
- Configure receiver wallet
- Create API key
- Add webhook URL

Demo Part 2: Payment link
- Create payment link for 10 USDC/test asset
- Copy and open hosted checkout URL
- Customer connects wallet
- Customer pays
- Checkout shows payment success

Demo Part 3: Developer observability
- Return to dashboard
- Show PaymentIntent marked as paid
- Open transaction hash in debugger
- Show webhook delivery log
- Show SDK snippet that creates the same checkout flow
```

---

## 16. Agent Implementation Notes

The existing TalaKit codebase should not be rewritten. Extend the current Phase 1 MVP by adding payment-specific tables, routes, UI pages, and webhook event types.

Suggested implementation order for coding agents:

1. Add `payment_intents` schema/table.
2. Add mutations/actions for creating and updating PaymentIntents.
3. Add hosted checkout route `/pay/[paymentIntentId]`.
4. Add Stellar payment submission helper.
5. Add payment confirmation action using existing transaction debugger/RPC helpers.
6. Add webhook event types: `payment.succeeded`, `payment.failed`, `checkout.completed`.
7. Add dashboard pages for payments and checkout integration.
8. Add minimal SDK package or helper.
9. Add PayAccess contract only after payment flow works, unless the hackathon strictly checks inter-contract calls first.
