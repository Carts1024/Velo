# Velo Master Context

Last updated: 2026-07-08

Purpose: this file is the high-signal, agent-facing master context for Velo. Use it to onboard AI agents, contributors, product reviewers, architects, and technical writers before they modify code or documentation.

This document summarizes what Velo is, who it serves, how the product works, how the codebase is structured, what flows are implemented, what is still alpha-only, and where to inspect source files for details.

## One-Line Summary

Velo is developer-first stablecoin payment infrastructure, settlement tooling, and project verification for Stellar builders, currently focused on Stellar Testnet checkout, Soroban project trust, signed merchant webhooks, and PDAX UAT settlement demos.

## Product Thesis

Stellar builders repeatedly need the same operational rails:

- Prove which project and contract addresses are official.
- Accept stablecoin payments without building a checkout stack from scratch.
- Verify payments against ledger data instead of trusting browser callbacks.
- Notify merchant systems through signed webhooks.
- Debug transactions and monitor contract events.
- Demonstrate regional fiat settlement after stablecoin collection.

Velo packages these workflows into a project console, developer API, SDK, smart contracts, and backend automation.

## Current Status

Velo Pay Alpha is feature-complete at code level for Testnet checkout and includes a PDAX UAT settlement layer. The main readiness gates are live Testnet demo rehearsal, deployed Registry and PayAccess contract IDs in hosted envs, PDAX UAT credential/callback validation, and browser wallet QA.

Implemented:

- Wallet connection through Stellar Wallets Kit, with Freighter-first Testnet usage.
- Wallet-signed authentication using SEP-10-style challenge flow, app JWTs, and Convex ownership checks.
- Project dashboard for project metadata, on-chain registration, API keys, contract links, payment access, events, webhooks, integration snippets, settings, and settlement.
- Soroban `VeloRegistry` contract for project identity and official contract IDs.
- Soroban `VeloPayAccess` contract for payment access activation and checkout credits.
- Hosted checkout at `/pay/[paymentIntentId]`.
- PaymentIntent API with API-key authentication, idempotency, rate-limit headers, paginated list, and single-intent reads.
- Backend scanner that verifies payment settlement before marking a PaymentIntent paid.
- Signed merchant webhooks with delivery logs and retries.
- Transaction debugger and contract event monitor.
- `@carts1024/velo-sdk` alpha package.
- Runnable Express and Next.js App Router merchant examples.
- PDAX UAT settlement flow for balances, quotes, trades, InstaPay UAT withdrawals, callbacks, payout polling, and normalized settlement webhooks.

Deferred or needs hardening:

- Mainnet support.
- Distributed production-grade rate limiting.
- Full RPC gateway and broad analytics.
- Webhook dual-secret grace window during rotation.
- Production settlement provider compliance flows.
- End-to-end hosted demo validation across target wallets/devices.

## Target Audience

Primary:

- Stellar and Soroban developers building dApps, payment tools, and protocol integrations.
- Hackathon teams that need credible demo infrastructure quickly.
- Stablecoin merchants or merchant-platform developers exploring Stellar checkout.
- Projects that need public contract verification and wallet-linked ownership.

Secondary:

- Ecosystem reviewers evaluating whether a Stellar project has official contract provenance.
- Developer relations teams that need demoable payment and settlement flows.
- Regional fintech builders exploring stablecoin-to-fiat settlement patterns.

## Value Proposition

For Stellar developers:

- Faster path from project registration to hosted checkout.
- Less custom webhook, event polling, and transaction verification code.
- Public trust surface for project and contract identity.
- Clear SDK/API integration path.

For merchants:

- API-key-based checkout creation.
- Hosted buyer payment page.
- Payment status tracking and signed notifications.
- Optional settlement demo from stablecoin to PHP through PDAX UAT.

For ecosystem users:

- Public verification page for project ownership and official contracts.
- Safer inspection of project state without leaking private dashboard data.

## GTM Notes

Near-term wedge:

- Position Velo as the fastest way for Stellar hackathon and early-stage teams to accept Testnet stablecoin payments with verifiable project identity.
- Use the hosted checkout plus public verification page as the demo hook.
- Use PDAX UAT settlement as the APAC/regional-fintech narrative: stablecoin collection can connect to local payout rails.

Developer adoption path:

1. Land on Velo and connect a Testnet wallet.
2. Create a project and register it through `VeloRegistry`.
3. Activate payments through `VeloPayAccess`.
4. Generate an API key.
5. Create a PaymentIntent through API, SDK, cURL, or example app.
6. Send a buyer to hosted checkout.
7. Receive signed webhooks and inspect logs.
8. Optionally demonstrate settlement through PDAX UAT.

Useful proof points:

- On-chain project identity.
- Hosted checkout with wallet signing.
- Ledger-verified payment status.
- Signed webhook delivery logs.
- Settlement event lifecycle from quote through withdrawal.

## Core Product Areas

### Project Verification

Purpose: prove that a wallet-owned project and its official Soroban contract IDs are connected.

Key behavior:

- Project owner registers metadata hash and project identity on `VeloRegistry`.
- Owner can add/remove official contract IDs.
- Registry stores project owner, active state, metadata hash, and official contract IDs.
- Public verification page exposes safe project state at `/verify/[slug]`.

Source map:

- `contracts/registry/src/lib.rs`
- `contracts/registry/src/types.rs`
- `contracts/registry/tests/registry.rs`
- `packages/stellar/src/registry.ts`
- `apps/web/features/projects/public-verification.tsx`
- `apps/web/app/verify/[slug]/page.tsx`

### Velo Pay

Purpose: let a project create hosted Stellar Testnet checkout links and receive verified payment status.

Key behavior:

- Project activates payment access through `VeloPayAccess`.
- Merchant creates PaymentIntent through API or SDK.
- Hosted checkout renders amount, asset, receiver, merchant, expiry, and status.
- Buyer connects wallet, signs, and submits payment.
- Public checkout can move intent to pending, but cannot mark it paid.
- Backend scanner verifies ledger status and marks intent `paid` or `failed`.
- Merchant receives signed webhook such as `payment.succeeded`.

Payment statuses:

- `created`
- `pending`
- `paid`
- `failed`
- `cancelled`
- `expired`

Source map:

- `contracts/pay_access/src/lib.rs`
- `packages/stellar/src/pay-access.ts`
- `packages/stellar/src/checkout.ts`
- `apps/web/app/pay/[paymentIntentId]/page.tsx`
- `apps/web/features/checkout/checkout-client.tsx`
- `apps/web/app/api/v1/payment-intents/route.ts`
- `apps/web/app/api/v1/payment-intents/[id]/route.ts`
- `packages/backend/convex/payment_intents/*`
- `docs/velo-pay-checkout.md`

### Developer API and SDK

Purpose: give server-side merchant apps a stable API for creating and reading PaymentIntents.

API routes:

```txt
POST /api/v1/payment-intents
GET  /api/v1/payment-intents
GET  /api/v1/payment-intents/[id]
GET  /api/v1/events
GET  /api/v1/transactions/[hash]
GET  /api/v1/webhooks/deliveries
POST /api/webhooks/pdax
POST /api/webhook-tester
POST /api/auth/wallet/challenge
POST /api/auth/wallet/verify
GET  /api/auth/wallet/jwks
```

API key behavior:

- Keys use `tk_live_...` format in the current alpha implementation.
- Keys are stored as SHA-256 hashes in Convex.
- Requests accept `Authorization: Bearer <key>` or `x-api-key`.
- Public API routes return `X-RateLimit-*` headers.
- PaymentIntent creation supports `Idempotency-Key`.
- List reads support status filtering, limits, cursors, and SDK pagination.

SDK:

- Package: `@carts1024/velo-sdk`.
- Server-side only.
- ESM-only.
- Supports `new Velo({ apiKey, environment })`.
- Supports `velo.checkout.sessions.create`.
- Supports `velo.paymentIntents.create`, `retrieve`, and `list`.
- Supports `Velo.webhooks.verify` and instance-level webhook verification.

Source map:

- `packages/velo-sdk/src/client.ts`
- `packages/velo-sdk/src/http.ts`
- `packages/velo-sdk/src/webhooks.ts`
- `packages/velo-sdk/src/types.ts`
- `packages/velo-sdk/README.md`
- `examples/express/README.md`
- `examples/nextjs-app-router/README.md`

### Webhooks

Purpose: notify merchant systems about payment, transaction, project, contract, and settlement events with signed, retried delivery.

Supported event types:

```txt
contract.event
transaction.succeeded
transaction.failed
project.registered
project.updated
payment.created
payment.succeeded
payment.failed
payment_access.activated
settlement.quote.created
settlement.trade.executed
settlement.withdrawal.pending
settlement.withdrawal.succeeded
settlement.withdrawal.failed
provider.pdax.event.received
```

Delivery behavior:

- Outbound deliveries are sent with `user-agent: Velo-Webhook/1.0`.
- Headers include `x-velo-event`, `x-velo-delivery`, and optional `x-velo-signature`.
- HMAC signature format is `t=<timestamp>,v1=<sha256>`.
- Retry schedule is up to five attempts with delays `[0, 15, 60, 300, 900]` seconds.
- Endpoint validation rejects unsafe destinations such as localhost, non-HTTPS URLs, and embedded credentials.
- Delivery logs track status, HTTP status, error, attempt count, response time, destination host, payload summary, and related payment/settlement IDs.

Source map:

- `packages/backend/convex/webhookDelivery.ts`
- `packages/backend/convex/webhook_endpoints/*`
- `packages/backend/convex/webhook_deliveries/*`
- `apps/web/features/projects/project-webhooks.tsx`
- `apps/web/app/api/v1/webhooks/deliveries/route.ts`
- `packages/velo-sdk/src/webhooks.ts`

### Observability

Purpose: help developers inspect payment state, contract activity, webhook health, and Stellar transaction outcomes.

Features:

- Dashboard with payment stats, recent payments, recent contract events, webhook health, and demo readiness.
- Transaction debugger for 64-character Stellar transaction hashes.
- Contract event monitor for active official contract IDs.
- Convex-backed cache for transaction/debugger data.
- Webhook delivery log inspection.

Source map:

- `apps/web/features/projects/dashboard.tsx`
- `apps/web/features/projects/event-activity.tsx`
- `apps/web/features/projects/project-events.tsx`
- `apps/web/features/debugger/transaction-debugger.tsx`
- `packages/backend/convex/contract_events/*`
- `packages/backend/convex/transactions/*`
- `packages/stellar/src/event-monitor.ts`
- `packages/stellar/src/transaction-debugger.ts`

### Velo Settlement

Purpose: demonstrate post-payment stablecoin-to-fiat settlement through PDAX UAT.

Current scope:

- UAT/sandbox only.
- Supports `USDCXLM` to `PHP` demo path.
- Supports InstaPay UAT withdrawals to test bank destinations.
- Uses project-scoped provider connection records and cached PDAX session tokens.

Settlement flow:

1. Project owner opens Settlement page.
2. Owner connects PDAX provider.
3. Backend logs in or refreshes cached PDAX UAT tokens.
4. Dashboard fetches sandbox balances.
5. Owner requests indicative or firm quote.
6. Firm quote is stored with expiry and status.
7. Owner executes trade while quote is active.
8. Backend records `TRADE_EXECUTED`.
9. Owner initiates InstaPay UAT withdrawal.
10. Backend records `PAYOUT_PENDING`.
11. PDAX callback or cron payout polling updates terminal status.
12. Velo emits signed merchant settlement webhook.

Settlement statuses:

- `QUOTE_PENDING`
- `QUOTE_FIRM`
- `TRADE_EXECUTED`
- `PAYOUT_PENDING`
- `PAYOUT_SUCCEEDED`
- `PAYOUT_FAILED`

Quote statuses:

- `active`
- `expired`
- `executed`

Settlement webhook types:

- `settlement.quote.created`
- `settlement.trade.executed`
- `settlement.withdrawal.pending`
- `settlement.withdrawal.succeeded`
- `settlement.withdrawal.failed`
- `provider.pdax.event.received`

PDAX client capabilities:

- `login`
- `refresh`
- `balances`
- `cryptoDepositAddress`
- `indicativeQuote`
- `firmQuote`
- `executeTrade`
- `getOrder`
- `fiatWithdraw`
- `getFiatTransactions`
- `registerWebhook`
- `parseWebhook`
- `verifyWebhook`

Source map:

- `packages/pdax/src/client.ts`
- `packages/pdax/README.md`
- `packages/backend/convex/settlement/actions.ts`
- `packages/backend/convex/settlement/helpers.ts`
- `packages/backend/convex/provider_connections/*`
- `packages/backend/convex/provider_events/*`
- `packages/backend/convex/settlement_quotes/*`
- `packages/backend/convex/settlement_transactions/*`
- `apps/web/features/projects/project-settlement.tsx`
- `apps/web/app/api/webhooks/pdax/route.ts`
- `docs/prds/prd-velo-pdax/pdax-settlement-workflow.md`

## Primary End-to-End Workflows

### Merchant Onboarding

```txt
Developer connects wallet
  -> Velo issues wallet auth challenge
  -> Developer signs challenge
  -> Velo verifies wallet signature and issues app JWT
  -> Developer creates project
  -> Project exists in Convex as draft/dashboard state
```

### Project Registration

```txt
Developer creates project metadata
  -> Velo computes metadata hash
  -> Developer signs Soroban transaction
  -> VeloRegistry stores owner, name, metadata hash, active status
  -> Dashboard syncs on-chain registration state into Convex
```

### Payment Access Activation

```txt
Developer clicks Activate Velo Pay
  -> Wallet signs PayAccess transaction
  -> VeloPayAccess calls VeloRegistry.get_project(project_id)
  -> Registry confirms owner and active project
  -> PayAccess stores activation and credits
  -> Backend sync records payment access state
```

### Hosted Checkout

```txt
Merchant creates PaymentIntent
  -> Velo validates API key, project, access, idempotency, rate limit
  -> Convex stores PaymentIntent
  -> Velo returns checkoutUrl
  -> Buyer opens /pay/[paymentIntentId]
  -> Buyer connects Stellar wallet
  -> Buyer signs and submits transaction
  -> Intent becomes pending with transaction hash
  -> Backend scanner verifies ledger status
  -> Intent becomes paid or failed
  -> Merchant webhook is delivered
```

### Settlement

```txt
PaymentIntent is paid
  -> Merchant opens Settlement page
  -> Connects PDAX UAT provider
  -> Fetches balances
  -> Locks firm quote
  -> Executes trade
  -> Initiates withdrawal
  -> PDAX callback or polling updates payout state
  -> Velo emits signed settlement webhook
```

## Architecture Overview

```mermaid
flowchart TD
  Merchant[Developer / Merchant] --> Web[Next.js app: apps/web]
  Customer[Customer] --> Checkout[Hosted checkout: /pay/:id]
  Web --> Wallet[Stellar Wallets Kit / Freighter]
  Checkout --> Wallet
  Web --> Convex[Convex backend]
  Checkout --> Convex
  API[Next API routes] --> Convex
  SDK[@carts1024/velo-sdk] --> API
  Web --> StellarPkg[packages/stellar helpers]
  Checkout --> StellarPkg
  StellarPkg --> Horizon[Stellar Horizon Testnet]
  StellarPkg --> RPC[Stellar RPC Testnet]
  Wallet --> Horizon
  Wallet --> RPC
  RPC --> Registry[VeloRegistry]
  RPC --> PayAccess[VeloPayAccess]
  PayAccess --> Registry
  Convex --> Pollers[Convex cron pollers]
  Pollers --> RPC
  Convex --> Webhooks[Signed merchant webhooks]
  Webhooks --> MerchantEndpoint[Merchant endpoint]
  Settlement[Settlement dashboard] --> Convex
  Convex --> PdaxPkg[@repo/pdax]
  PdaxPkg --> PDAX[PDAX UAT API]
  PDAX --> PdaxWebhook[/api/webhooks/pdax]
  PdaxWebhook --> Convex
```

## Codebase Structure

```txt
.
|-- apps
|   `-- web                  # Next.js app, routes, feature UI, config, assets
|-- packages
|   |-- backend              # Convex schema, queries, mutations, actions, crons
|   |-- pdax                 # Server-only PDAX UAT client
|   |-- stellar              # Stellar SDK helpers
|   |-- ui                   # Shared React components and styles
|   |-- velo-sdk             # Public alpha Node.js SDK
|   `-- typescript-config    # Shared TS configs
|-- contracts
|   |-- registry             # Soroban VeloRegistry contract
|   `-- pay_access           # Soroban VeloPayAccess contract
|-- examples
|   |-- express              # Merchant Express integration
|   `-- nextjs-app-router    # Merchant Next.js integration
`-- docs                     # Guides, PRDs, status docs, master context
```

## Important Frontend Routes

Public:

- `/` - landing page.
- `/docs` - interactive SDK/API docs.
- `/debug` - transaction debugger.
- `/verify/[slug]` - public project verification.
- `/feedback` - feedback form/list.
- `/pay/[paymentIntentId]` - hosted checkout.
- `/pay/[paymentIntentId]/success` - payment success.
- `/pay/[paymentIntentId]/cancel` - payment cancellation.
- `/pay/[paymentIntentId]/failed` - payment failure.

Project console:

- `/dashboard` - project overview/dashboard entry.
- `/projects/new` - create draft project.
- `/projects/[projectId]` - project detail, registration, API keys, pay activation.
- `/projects/[projectId]/contracts` - official contract management.
- `/projects/[projectId]/events` - contract/project event monitoring.
- `/projects/[projectId]/webhooks` - webhook settings and logs.
- `/projects/[projectId]/integration` - integration snippets.
- `/projects/[projectId]/settings` - project metadata/settings.
- `/projects/[projectId]/settlement` - PDAX UAT settlement workflow.

## Backend Data Model Summary

Convex tables are organized by feature modules:

- `projects`: owner identity, project metadata, registry state, payment access state.
- `apiKeys`: hashed merchant API keys, labels, revocation, usage metadata.
- `paymentIntents`: hosted checkout state.
- `paymentIntentIdempotencyKeys`: idempotent create-request tracking.
- `transactions`: Stellar transaction/debugger cache.
- `contractEvents`: stored Soroban contract event activity.
- `pollerState`: bounded polling cursors/state.
- `webhookEndpoints`: merchant webhook configuration and signing secrets.
- `webhookDeliveries`: outbound delivery attempts and logs.
- `providerConnections`: PDAX connection/token cache per project.
- `settlementQuotes`: PDAX quote records and expiry/status data.
- `settlementTransactions`: settlement lifecycle records.
- `providerEvents`: inbound provider callback records for deduplication.
- `feedback`: product feedback records.
- `users`: wallet/user profile records.

Source map:

- `packages/backend/convex/schema.ts`
- `packages/backend/convex/*/schema.ts`
- `packages/backend/convex/crons.ts`

## Cron Jobs

Convex cron schedule:

- Every 1 minute: poll recent contract events.
- Every 1 minute: sync PayAccess events.
- Every 1 minute: check pending PaymentIntents.
- Every 2 minutes: poll pending PDAX payout status.

Source map:

- `packages/backend/convex/crons.ts`
- `packages/backend/convex/contractEventPolling.ts`
- `packages/backend/convex/payAccessSync.ts`
- `packages/backend/convex/payment_intents/scanner.ts`
- `packages/backend/convex/settlement/actions.ts`

## Security and Trust Boundaries

Important invariants:

- Browser checkout code cannot mark an intent paid.
- PaymentIntent paid status requires backend ledger verification.
- Receiver address comes from the project owner, not arbitrary API request input.
- API keys are shown once and stored hashed.
- Webhook endpoints are validated before use.
- Webhook payloads are signed with HMAC-SHA256.
- Project mutations require wallet ownership checks.
- Soroban owner-only operations use `require_auth`.
- PDAX credentials are server-only environment secrets.
- SDK is server-side only because it uses merchant API keys and webhook secrets.

Known alpha limitations:

- Current public payment API rate limiting is in-memory.
- Testnet only for payment flows.
- PDAX integration is UAT/sandbox only.
- Mainnet settlement/compliance is not implemented.
- Production webhook secret rotation does not yet include a dual-secret grace window.

## Environment Variables

Core web/backend:

```bash
NEXT_PUBLIC_CONVEX_URL=<convex_deployment_url>
NEXT_PUBLIC_CONVEX_SITE_URL=<convex_site_url>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID=<deployed_registry_contract_id>
NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID=<deployed_pay_access_contract_id>
NEXT_PUBLIC_USDC_ISSUER=<testnet_usdc_issuer>
VELO_PAY_ACCESS_CONTRACT_ID=<deployed_pay_access_contract_id>
VELO_AUTH_JWT_PRIVATE_KEY_PEM=<ec_private_key_pem>
VELO_AUTH_CHALLENGE_SECRET=<random_32_plus_byte_secret>
RATE_LIMIT_KEY_MAX=60
RATE_LIMIT_PROJECT_MAX=100
```

PDAX UAT:

```bash
PDAX_UAT_BASE_URL=https://uat.services.sandbox.pdax.ph/api/pdax-api
PDAX_UAT_USERNAME=<provided_uat_username>
PDAX_UAT_PASSWORD=<provided_uat_password>
PDAX_CALLBACK_URL=<public_callback_url_for_/api/webhooks/pdax>
```

SDK/example apps:

```bash
VELO_API_KEY=<merchant_api_key>
VELO_WEBHOOK_SECRET=<webhook_signing_secret>
VELO_BASE_URL=<optional_api_base_url>
```

## Development Commands

Root:

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint:fix
```

Focused packages:

```bash
pnpm --filter web dev
pnpm --filter web test
pnpm --filter web build
pnpm --filter @repo/backend dev
pnpm --filter @repo/backend test
pnpm --filter @repo/stellar test
pnpm --filter @repo/pdax test
pnpm --filter @carts1024/velo-sdk test
```

Contracts:

```bash
cd contracts/registry && cargo test
cd contracts/pay_access && cargo test
stellar contract build --manifest-path contracts/registry/Cargo.toml
stellar contract build --manifest-path contracts/pay_access/Cargo.toml
```

## Agent Guidance

Before editing:

- For Convex code under `packages/backend/convex`, read `packages/backend/AGENTS.md` and `packages/backend/convex/_generated/ai/guidelines.md`.
- Do not edit generated files in `packages/backend/convex/_generated` unless generated by the relevant tool.
- Prefer existing package boundaries and workspace imports.
- Treat payment, wallet auth, webhook signing, and settlement state transitions as security-sensitive.
- Add or update focused tests when behavior changes.

When researching:

- Product surface starts in `README.md`, `docs/demo-setup.md`, `docs/velo-pay-checkout.md`, and this file.
- Web route behavior starts in `apps/web/app`.
- Feature UI starts in `apps/web/features`.
- Convex behavior starts in `packages/backend/convex`.
- Stellar helpers start in `packages/stellar/src`.
- Soroban logic starts in `contracts/*/src/lib.rs`.
- Public SDK behavior starts in `packages/velo-sdk/src/client.ts`.
- PDAX behavior starts in `packages/pdax/src/client.ts` and `packages/backend/convex/settlement/actions.ts`.

## Key Documentation

- `README.md` - public repo entry point.
- `docs/velo-pay-checkout.md` - checkout and PaymentIntent guide.
- `docs/demo-setup.md` - end-to-end demo guide.
- `docs/prds/prd-velo-pdax/pdax-settlement-workflow.md` - settlement workflow details.
- `packages/velo-sdk/README.md` - SDK usage and webhook verification.
- `packages/pdax/README.md` - PDAX UAT package docs.
- `contracts/registry/README.md` - Registry contract docs.
- `contracts/pay_access/README.md` - PayAccess contract docs.
- `examples/express/README.md` - Express merchant example.
- `examples/nextjs-app-router/README.md` - Next.js merchant example.

