
# Velo

<p align="center">
  <img src="apps/web/public/iconv2.png" alt="Velo logo" width="125" height="125" />
</p>

**Developer-first stablecoin payment infrastructure and verification tooling for Stellar builders.**

Velo helps Stellar and Soroban teams register verified projects, link official contracts, debug transactions, monitor contract events, and accept stablecoin payments through hosted checkout on Stellar Testnet.

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
- Inspect payment, transaction, contract event, and webhook logs.

## Current Status

As of `2026-07-01`, Velo Pay Alpha is **feature-complete at code level** and covered by focused tests. Live Testnet deployment and full end-to-end demo validation remain the main readiness gate.

Implemented:

- Stellar Testnet wallet connection through Stellar Wallets Kit.
- Wallet-signed challenge auth, app-issued JWTs, and Convex `ownerTokenIdentifier` ownership checks.
- Project/merchant dashboard with on-chain registration status.
- Soroban `VeloRegistry` contract.
- Soroban `VeloPayAccess` contract with Registry inter-contract verification.
- Official contract add/remove management.
- Public verification page at `/verify/[slug]`.
- API key generation with hashed storage, labels, revocation, request count, and last-used tracking.
- `POST /api/v1/payment-intents` with API-key auth and rate-limit headers.
- Hosted checkout pages with `created`, `pending`, `paid`, `failed`, `expired`, and `cancelled` flows.
- Backend payment scanner that marks payments paid only after ledger verification.
- Checkout SDK helper and integration snippet page.
- Signed webhooks with HMAC-SHA256, delivery logs, secret rotation, and retry/backoff.
- Contract event monitor and bounded event polling.
- Transaction debugger backed by Stellar RPC and Convex cache.
- Public API rate limiting for current API routes.

Still needs validation/hardening:

- Hosted Registry and PayAccess contract IDs in Vercel/Convex envs.
- Live Testnet dry run: register project, activate PayAccess, create PaymentIntent, pay, confirm webhook.
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
POST /api/v1/payment-intents
GET  /api/v1/events
GET  /api/v1/transactions/[hash]
GET  /api/v1/webhooks/deliveries
```

API behavior:

- API keys accepted from `Authorization: Bearer` or `x-api-key`.
- Keys are stored as SHA-256 hashes in Convex.
- Active payment access is required before API-created PaymentIntents are authorized.
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
```

Webhook behavior:

- Payloads are signed with HMAC-SHA256 in `x-velo-signature`.
- Deliveries include `x-velo-event` and `x-velo-delivery` headers.
- Failed automatic deliveries retry with backoff up to five attempts.
- Endpoint signing secrets can be rotated from the project webhook UI.
- Delivery logs track status, HTTP status, error, attempt count, response time, destination host, payload summary, and PaymentIntent ID where relevant.

### Observability

- Transaction debugger accepts 64-character Stellar transaction hashes.
- Contract event monitor polls active official contract IDs.
- Dashboard shows payment stats, recent payments, recent events, webhook health, and demo readiness.

## Repository Structure

```txt
.
|-- apps
|   `-- web                  # Next.js 16 app, routes, features, config, public assets
|-- packages
|   |-- backend              # Convex schema, queries, mutations, actions, crons
|   |-- stellar              # TypeScript Stellar SDK helpers
|   |-- ui                   # Shared React UI components and styles
|   `-- typescript-config    # Shared TypeScript configs
|-- contracts
|   |-- registry             # Rust Soroban VeloRegistry contract and tests
|   `-- pay_access           # Rust Soroban VeloPayAccess contract and tests
`-- docs
    `-- prds                 # Product specs, Alpha plans, SDK docs, and status reports
```

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, App Router, Tailwind CSS.
- **UI**: Shared `@repo/ui` package, lucide-react, reusable feature components.
- **Backend**: Convex queries, mutations, actions, crons, custom JWT auth.
- **Blockchain**: Stellar Testnet, Soroban, Stellar RPC, Horizon, `@stellar/stellar-sdk`.
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

- [Project status report](docs/prds/talakit-project-status-report-2026-06-29.md)
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
```

## License

MIT
