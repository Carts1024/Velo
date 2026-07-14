# Velo

<p align="center">
  <img src="apps/web/public/iconv2.png" alt="Velo logo" width="500" height="500" />
</p>

**Developer-first stablecoin payment infrastructure, settlement tooling, and verification for Stellar builders.**

Velo helps Stellar and Soroban teams register verified projects, link official contracts, debug transactions, monitor contract events, accept stablecoin payments through hosted checkout on Stellar Testnet, and run a PDAX UAT settlement demo from stablecoin conversion through PHP bank payout.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square)
![React](https://img.shields.io/badge/React-19-149eca?style=flat-square)
![Convex](https://img.shields.io/badge/Convex-Backend-f3b01c?style=flat-square)
![Stellar](https://img.shields.io/badge/Stellar-Soroban-7d00ff?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square)
![Rust](https://img.shields.io/badge/Rust-Smart_Contracts-b7410e?style=flat-square)

## What Velo Does

Velo packages the trust, payment, and observability workflows Stellar developers usually rebuild per app:

- Prove which contracts are official for a project.
- Register merchant/project identity on Soroban.
- Activate payment access through a second Soroban contract that verifies Registry state.
- Generate hashed API keys for merchant integrations.
- Create PaymentIntents through a developer API.
- Send customers to hosted checkout at `/pay/[paymentIntentId]`.
- Submit Stellar Testnet payments through connected wallets.
- Confirm payment settlement through backend ledger verification.
- Send signed webhooks with retry/backoff.
- Convert paid stablecoin flows through PDAX UAT quotes and trades.
- Initiate InstaPay UAT bank withdrawals and track payout status.
- Receive, normalize, and forward provider settlement events.
- Inspect payment, transaction, contract event, and webhook logs.

## Current Status

As of `2026-07-08`, Velo Pay Alpha is **feature-complete at code level** for Testnet checkout and includes a PDAX UAT settlement layer for demo conversion and payout workflows. Live Testnet deployment, PDAX UAT credential validation, and full end-to-end demo rehearsal remain the main readiness gates.

Implemented:

- Stellar Testnet wallet connection through Stellar Wallets Kit.
- Wallet-signed challenge authentication using the core SEP-10 Web Authentication cryptographic flow (with transaction envelopes, domain-binding, and timebounds), app-issued JWTs, and Convex `ownerTokenIdentifier` ownership checks.
- Project/merchant dashboard with on-chain registration status.
- Soroban `VeloRegistry` contract.
- Soroban `VeloPayAccess` contract with Registry inter-contract verification.
- Official contract add/remove management.
- Public verification page at `/verify/[slug]`.
- API key generation with hashed storage, labels, revocation, request count, and last-used tracking.
- `POST /api/v1/payment-intents` with API-key auth and rate-limit headers.
- `GET /api/v1/payment-intents` and `GET /api/v1/payment-intents/[id]` for paginated status reads.
- Hosted checkout pages with `created`, `pending`, `paid`, `failed`, `expired`, and `cancelled` flows.
- Backend payment scanner that marks payments paid only after ledger verification.
- Official alpha SDK package, integration snippet page, and runnable Express / Next.js examples.
- Signed webhooks with HMAC-SHA256, delivery logs, secret rotation, and retry/backoff.
- Contract event monitor and bounded event polling.
- Transaction debugger backed by Stellar RPC and Convex cache.
- PDAX UAT provider connection management with cached token refresh.
- Searchable/sortable PDAX sandbox balances.
- Indicative and 15-second firm quote requests for `USDCXLM` to `PHP`.
- PDAX trade execution, InstaPay UAT withdrawal initiation, provider webhook ingestion, payout status polling, and signed merchant settlement webhooks.
- Public API rate limiting for current API routes.

Still needs validation/hardening:

- Hosted Registry and PayAccess contract IDs in Vercel/Convex envs.
- Live Testnet dry run: register project, activate PayAccess, create PaymentIntent, pay, confirm webhook.
- PDAX UAT dry run: connect provider, lock quote, execute trade, initiate withdrawal, confirm webhook/polling status.
- Browser wallet QA on target demo devices.
- Distributed rate limiting across serverless instances.
- Optional webhook dual-secret grace window after rotation.
- Full RPC gateway and broad developer-ops analytics remain deferred.

## Alpha Flow

```txt
Developer connects wallet
    |
Creates Velo project / merchant profile
    |
Registers project on-chain with VeloRegistry
    |
Activates payment access with VeloPayAccess
    |
VeloPayAccess calls VeloRegistry.get_project(project_id)
    |
Developer generates API key and configures webhook
    |
Developer creates PaymentIntent through API or helper
    |
Velo returns hosted checkout URL
    |
Customer opens checkout and connects wallet
    |
Customer signs and submits Stellar Testnet payment
    |
Backend scanner verifies ledger status
    |
Velo marks PaymentIntent paid and sends payment.succeeded webhook
```

## Architecture

```mermaid
flowchart TD
  Merchant[Developer / Merchant] --> Web[Next.js app: apps/web]
  Customer[Customer] --> Checkout[Hosted checkout: /pay/:id]
  Web --> Wallet[Stellar Wallets Kit / Freighter]
  Checkout --> Wallet
  Web --> Convex[Convex backend]
  Checkout --> Convex
  API[Next API routes] --> Convex
  Web --> StellarPkg[packages/stellar helpers]
  Checkout --> StellarPkg
  StellarPkg --> Horizon[Stellar Horizon Testnet]
  StellarPkg --> RPC[Stellar RPC Testnet]
  Wallet --> Horizon
  Wallet --> RPC
  RPC --> Registry[VeloRegistry contract]
  RPC --> PayAccess[VeloPayAccess contract]
  PayAccess --> Registry
  Convex --> Pollers[Convex cron pollers]
  Pollers --> RPC
  Convex --> Webhooks[Signed webhook delivery]
  Webhooks --> MerchantEndpoint[Developer endpoint]
  Settlement[Velo Settlement dashboard] --> Convex
  Convex --> PDAX[@repo/pdax client]
  PDAX --> PDAXUAT[PDAX UAT API]
  PDAXUAT --> ProviderWebhook[PDAX callback: /api/webhooks/pdax]
  ProviderWebhook --> Convex
```

## Product Areas

### Project Verification

- `VeloRegistry` stores project owner, metadata hash, active status, and official contract IDs.
- Owner-only mutations use Soroban `require_auth` on-chain.
- Dashboard syncs registration state into Convex.
- Public verification pages expose safe project state without API keys, webhook URLs, or private logs.

### Velo Pay

- `VeloPayAccess` activates payments only for active Registry projects.
- PaymentIntents store amount, asset, receiver, merchant name, status, redirect URLs, payer, transaction hash, and expiry.
- Hosted checkout builds Stellar payment transactions, asks wallet to sign, submits through Horizon, then waits for backend verification.
- Public checkout code cannot mark an intent paid. Internal scanner marks verified payments paid after RPC lookup.

### Developer API

Current API routes:

```txt
POST /api/v2/payment-intents      # V2 anchor-aware routing (supports optional 'anchor')
GET  /api/v2/payment-intents      # V2 list
GET  /api/v2/payment-intents/[id] # V2 retrieve
POST /api/v1/payment-intents      # Legacy V1 (defaults to inhouse)
GET  /api/v1/payment-intents      # Legacy V1 list
GET  /api/v1/payment-intents/[id] # Legacy V1 retrieve
GET  /api/v1/events
GET  /api/v1/transactions/[hash]
GET  /api/v1/webhooks/deliveries
POST /api/webhooks/pdax
```

API behavior:

- API keys accepted from `Authorization: Bearer` or `x-api-key`.
- Keys are stored as SHA-256 hashes in Convex.
- Active payment access is required before API-created PaymentIntents are authorized.
- PaymentIntent creation supports `Idempotency-Key` conflict detection and replay.
- PaymentIntent list supports status filtering, limits, cursors, and SDK pagination.
- V2 endpoint supports routing anchor resolution: explicit `anchor` parameter (`"inhouse"` or `"pdax"`), falling back to API key scope, project default, and finally `"inhouse"`.
- Scoped API keys reject mismatches with client-requested anchors.
- Current routes use in-memory key/project rate limiting and return `X-RateLimit-*` headers.

### Webhooks

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

Webhook behavior:

- Payloads are signed with HMAC-SHA256 in `x-velo-signature`.
- Deliveries include `x-velo-event` and `x-velo-delivery` headers.
- Failed automatic deliveries retry with backoff up to five attempts.
- Endpoint URLs are validated to reject unsafe destinations such as localhost, non-HTTPS URLs, and embedded credentials.
- Endpoint signing secrets can be rotated from the project webhook UI.
- Delivery logs track status, HTTP status, error, attempt count, response time, destination host, payload summary, and PaymentIntent ID where relevant.
- PDAX provider callbacks are ingested at `/api/webhooks/pdax`, deduplicated in Convex, mapped to settlement transaction state, and forwarded as signed merchant events.

### Velo Settlement

- `@repo/pdax` wraps the PDAX UAT programmatic API for login, token refresh, balances, quotes, trades, orders, withdrawals, and callback parsing.
- Provider connections cache access, ID, and refresh tokens per project to avoid unnecessary login cycles.
- Settlement quotes store firm executable rates, expiry, provider quote IDs, and optional PaymentIntent linkage.
- Settlement transactions track `QUOTE_PENDING`, `QUOTE_FIRM`, `TRADE_EXECUTED`, `PAYOUT_PENDING`, `PAYOUT_SUCCEEDED`, and `PAYOUT_FAILED`.
- The settlement dashboard supports provider connection, balance search/sort, quote locking, trade execution, InstaPay UAT withdrawal, callback simulation, payout status checks, and webhook delivery review.
- Convex crons poll pending PDAX payouts every two minutes in addition to payment scanner and contract-event polling.

### Observability

- Transaction debugger accepts 64-character Stellar transaction hashes.
- Contract event monitor polls active official contract IDs.
- Dashboard shows payment stats, recent payments, recent events, webhook health, and demo readiness.
- Sprint 10 adds end-to-end request and journey correlation, vendor-neutral OTLP export, bounded Convex telemetry outbox processing, safe UI markers, and allowlist-only redaction.
- The checked-in local stack provisions Grafana, Tempo, Loki, Prometheus, and OpenTelemetry Collector. Sprint 10 is **IMPLEMENTED — LIVE EVIDENCE PENDING**; no live reconstruction or `<3%` p95 overhead verdict is claimed.

## Repository Structure

```txt
.
|-- apps
|   `-- web                  # Next.js 16 app, routes, features, config, public assets
|-- packages
|   |-- backend              # Convex schema, queries, mutations, actions, crons
|   |-- pdax                 # Server-only PDAX UAT client
|   |-- stellar              # TypeScript Stellar SDK helpers
|   |-- ui                   # Shared React UI components and styles
|   |-- velo-sdk             # Public alpha Node.js SDK and webhook verifier
|   `-- typescript-config    # Shared TypeScript configs
|-- contracts
|   |-- registry             # Rust Soroban VeloRegistry contract and tests
|   `-- pay_access           # Rust Soroban VeloPayAccess contract and tests
|-- examples                 # Express and Next.js merchant integration examples
`-- docs
    `-- prds                 # Product specs, Alpha plans, SDK docs, and status reports
```

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, App Router, Tailwind CSS.
- **UI**: Shared `@repo/ui` package, lucide-react, reusable feature components.
- **Backend**: Convex queries, mutations, actions, crons, custom JWT auth integrated with core SEP-10 challenge-response transaction validation.
- **Blockchain**: Stellar Testnet, Soroban, Stellar RPC, Horizon, `@stellar/stellar-sdk`.
- **Settlement**: PDAX UAT client package, Convex settlement actions, provider webhook ingestion, signed merchant settlement events.
- **Wallets**: Stellar Wallets Kit with Freighter-first Testnet flow.
- **Smart contracts**: Rust, `soroban-sdk`, Stellar CLI.
- **Tooling**: pnpm workspaces, Turborepo, oxlint, oxfmt, Husky.

## Local Development

### Prerequisites

- Node.js `>=18`.
- pnpm `10.25.0` or compatible.
- Rust toolchain.
- Stellar CLI.
- Convex account/project.
- Funded Stellar Testnet wallet for live chain flows.

### Install

```bash
pnpm install
```

### Environment

Required web environment:

```bash
NEXT_PUBLIC_CONVEX_URL=<convex_deployment_url>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Recommended Testnet environment:

```bash
NEXT_PUBLIC_CONVEX_SITE_URL=<convex_site_url>
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID=<deployed_registry_contract_id>
NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID=<deployed_pay_access_contract_id>
NEXT_PUBLIC_USDC_ISSUER=<testnet_usdc_issuer>
```

Hosted/production guardrails:

```bash
VELO_REQUIRE_CONTRACT_IDS=true
VELO_AUTH_JWT_PRIVATE_KEY_PEM="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"
VELO_AUTH_CHALLENGE_SECRET=<random 32+ byte secret>
VELO_PAY_ACCESS_CONTRACT_ID=<deployed_pay_access_contract_id>
RATE_LIMIT_KEY_MAX=60
RATE_LIMIT_PROJECT_MAX=100
```

Optional PDAX UAT settlement environment:

```bash
PDAX_UAT_BASE_URL=https://uat.services.sandbox.pdax.ph/api/pdax-api
PDAX_UAT_USERNAME=<provided_uat_username>
PDAX_UAT_PASSWORD=<provided_uat_password>
PDAX_CALLBACK_URL=<public_callback_url_for_/api/webhooks/pdax>
```

Contract IDs are validated and normalized. Hosted builds require both public contract IDs when `VELO_REQUIRE_CONTRACT_IDS=true` or `VERCEL_ENV=production`.

### Run Development

```bash
pnpm dev
```

Web app only:

```bash
pnpm --filter web dev
```

Convex backend only:

```bash
pnpm --filter @repo/backend dev
```

## Smart Contract Development

Build Registry:

```bash
stellar contract build --manifest-path contracts/registry/Cargo.toml
```

Test Registry:

```bash
cd contracts/registry
cargo test
```

Build PayAccess:

```bash
stellar contract build --manifest-path contracts/pay_access/Cargo.toml
```

Test PayAccess:

```bash
cd contracts/pay_access
cargo test
```

After deployment, set:

```bash
NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID=<DEPLOYED_REGISTRY_CONTRACT_ID>
NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID=<DEPLOYED_PAY_ACCESS_CONTRACT_ID>
VELO_PAY_ACCESS_CONTRACT_ID=<DEPLOYED_PAY_ACCESS_CONTRACT_ID>
```

## Testing and Quality

Run all tests:

```bash
pnpm test
```

Run package tests:

```bash
pnpm --filter web test
pnpm --filter @repo/backend test
pnpm --filter @repo/stellar test
pnpm --filter @repo/pdax test
pnpm --filter @carts1024/velo-sdk test
pnpm --filter @repo/observability test
```

Run contract tests:

```bash
cd contracts/registry && cargo test
cd contracts/pay_access && cargo test
```

Run lint, formatting, generated type steps, and TypeScript checks:

```bash
pnpm lint:fix
```

Build all packages:

```bash
pnpm build
```

## Key Documentation

- [Sprint 10 observability architecture](docs/architecture/sprint-10-end-to-end-observability-and-redaction.md)
- [Sprint 10 operator runbook](docs/operations/sprint-10-observability-and-redaction-runbook.md)
- [Sprint 10 observability, redaction, and overhead report](docs/references/sprint-10-observability-redaction-and-overhead-report.md)
- [Velo master context for AI agents](docs/velo-master-context.md)
- [Velo Pay checkout guide](docs/velo-pay-checkout.md)
- [Demo setup guide](docs/demo-setup.md)
- [PDAX settlement workflow](docs/prds/prd-velo-pdax/pdax-settlement-workflow.md)
- [Velo SDK README](packages/velo-sdk/README.md)
- [PDAX package README](packages/pdax/README.md)
- [Express merchant example](examples/express/README.md)
- [Next.js App Router merchant example](examples/nextjs-app-router/README.md)
- [Project status report](docs/prds/talakit-project-status-report-2026-07-06.md)
- [Pay-prioritized Alpha spec](docs/prds/prd-talakit02026-06-26/talakit-alpha-spec-pay-prioritized.md)
- [Original Alpha spec](docs/prds/prd-talakit02026-06-26/talakit-alpha-spec.md)
- [SDK phase docs](docs/prds/prd-velo-sdk/sdk-phase.md)
- [SDK sprint plan](docs/prds/prd-velo-sdk/sdk-sprint-plan.md)
- [Registry contract README](contracts/registry/README.md)
- [PayAccess contract README](contracts/pay_access/README.md)

## Alpha Acceptance Target

Alpha is demo-ready when this live Testnet path is verified:

```txt
1. Developer opens Velo.
2. Developer connects Freighter wallet on Testnet.
3. Developer creates a Velo project / merchant profile.
4. Developer registers project on-chain using VeloRegistry.
5. Developer activates payment access using VeloPayAccess.
6. VeloPayAccess verifies project status through VeloRegistry.
7. Developer generates API key and configures webhook.
8. Developer creates PaymentIntent through API/snippet.
9. Velo generates hosted payment link.
10. Customer opens payment link.
11. Customer connects wallet and submits Testnet payment.
12. Velo scanner confirms ledger status and marks PaymentIntent paid.
13. Velo sends signed payment.succeeded webhook.
14. Developer sees payment status, metrics, and webhook delivery logs.
15. Public verify page shows project and official contracts.
16. Developer optionally opens Settlement, connects PDAX UAT, locks a firm quote, executes a trade, initiates an InstaPay UAT withdrawal, and receives signed settlement webhooks.
```

## License

MIT
