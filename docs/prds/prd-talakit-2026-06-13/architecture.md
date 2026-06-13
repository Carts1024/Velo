---
title: "Architecture: TalaKit Verify + Debug"
status: draft
created: 2026-06-13
updated: 2026-06-13
workflowType: architecture
project_name: TalaKit
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - docs/prds/prd-talakit-2026-06-13/prd.md
  - docs/prds/prd-talakit-2026-06-13/addendum.md
  - docs/prds/prd-talakit-2026-06-13/.decision-log.md
  - README.md
  - FOLDER_STRUCTURE.md
---

# Architecture: TalaKit Verify + Debug

## 1. Architecture Summary

TalaKit is a full-stack developer operations app for Stellar Testnet and Soroban projects. The hackathon MVP should use the existing monorepo shape:

- `apps/web`: Next.js dashboard and public verification pages.
- `packages/backend`: Convex database, server functions, scheduled jobs, and action wrappers around Stellar RPC and webhook delivery.
- `packages/ui`: shared shadcn/ui-based React components.
- `contracts/registry`: new Rust Soroban registry contract package.
- `packages/stellar`: new shared TypeScript package for Stellar/Soroban client helpers, validation, decoding, and domain types.

The architecture keeps on-chain data authoritative for trust-critical registry state, while Convex stores dashboard state, public metadata, webhook configuration, cached activity, and delivery logs.

```txt
Developer Browser
  |
  | Next.js App Router, React, Freighter
  v
apps/web
  |
  | Convex React client
  v
packages/backend/convex
  |        |            |
  |        |            +--> Webhook action worker
  |        +--------------> Stellar RPC / Soroban RPC
  +-----------------------> Convex database

Freighter signed transactions
  |
  v
Soroban Registry Contract on Stellar Testnet
```

## 2. Architectural Goals

- Ship the Verify + Debug demo without building production infrastructure too early.
- Make on-chain registry state the source of truth for ownership, active status, and official contracts.
- Use Convex for rapid MVP data persistence, live dashboard updates, scheduling, and background actions.
- Keep Stellar-specific logic outside page components so future agents can implement consistently.
- Bound all event, log, and RPC reads to avoid unbounded queries.
- Preserve a clean path to a developer beta with API keys, RPC gateway logs, stronger webhooks, and team projects.

## 3. Key Decisions

| ID | Decision | Rationale | Trade-off |
| --- | --- | --- | --- |
| ADR-001 | Use Next.js App Router for web UI. | Already present, good for dashboard and public pages. | Server/client boundaries need discipline with wallet-only code. |
| ADR-002 | Use Convex as MVP backend and database. | Already present, fast for real-time dashboard updates and scheduled jobs. | Long-term analytics and indexing may outgrow Convex alone. |
| ADR-003 | Add a Rust Soroban registry contract package. | Owner-only mutations must be enforced on-chain. | Requires contract build/deploy workflow in repo. |
| ADR-004 | Treat Stellar Testnet as the only MVP network. | Matches PRD and reduces network abstraction work. | Mainnet and Futurenet require later config and migration strategy. |
| ADR-005 | Store only trust-minimal project registry data on-chain. | Keeps contract simple and cheap. | Public metadata must be integrity-linked by hash. |
| ADR-006 | Store webhook URLs only in private Convex records. | Prevents public-page leakage. | Requires separate public and owner dashboard query paths. |
| ADR-007 | Implement event monitoring with bounded polling first. | Demoable with fewer moving parts than a production indexer. | Event history is recent-window only in MVP. |
| ADR-008 | Defer API keys and RPC gateway unless core demo is done. | PRD explicitly marks these optional. | Request log architecture is documented but not required for MVP acceptance. |
| ADR-009 | Use deterministic project slugs off-chain, not on-chain. | Friendly URLs are a web concern. | Slug conflicts must be handled in Convex. |
| ADR-010 | Do webhook delivery through Convex actions with delivery logs. | Provides visible evidence for demo and operational debugging. | Retry/backoff remains limited in MVP. |

## 4. Component Architecture

### 4.1 Web App: `apps/web`

Responsibilities:

- Wallet connection and account display.
- Project creation and dashboard UI.
- Registry transaction preparation, Freighter signing, and submission flow.
- Official contract add/remove UI.
- Public verified project page.
- Transaction hash debugger.
- Event monitor and webhook delivery log views.

Recommended route structure:

```txt
apps/web/app/
  page.tsx
  dashboard/
    page.tsx
  projects/
    new/page.tsx
    [projectId]/page.tsx
    [projectId]/contracts/page.tsx
    [projectId]/webhooks/page.tsx
  verify/
    [slug]/page.tsx
  debug/
    page.tsx
```

Feature modules:

```txt
apps/web/features/
  wallet/
  projects/
  registry/
  debugger/
  events/
  webhooks/
```

Page components should stay thin. Feature modules should own forms, hooks, and display components. Stellar transaction building should live in `packages/stellar`, not inside route files.

### 4.2 Backend: `packages/backend/convex`

Responsibilities:

- Store off-chain project records and settings.
- Expose owner dashboard queries and public verification queries.
- Validate and store webhook URLs privately.
- Cache transaction lookup results and recent events.
- Run scheduled event polling jobs.
- Execute webhook delivery attempts.
- Record transaction lookup failures and webhook delivery diagnostics.

Function groups:

```txt
packages/backend/convex/
  schema.ts
  projects.ts
  registrySync.ts
  transactions.ts
  events.ts
  webhooks.ts
  public.ts
  jobs.ts
  lib/
    stellarRpc.ts
    webhookDelivery.ts
    validation.ts
```

Convex queries should be split by visibility:

- Public queries must never return webhook URLs, secrets, API keys, or dashboard-only settings.
- Owner queries can return private project settings after wallet ownership verification.
- Internal mutations/actions can update polling cursors, cached events, and delivery logs.

### 4.3 Stellar Shared Package: `packages/stellar`

Add a TypeScript package to centralize Stellar-specific client logic.

Responsibilities:

- Validate Stellar public keys, contract IDs, transaction hashes, and network config.
- Build registry contract invocation transactions.
- Parse transaction responses into TalaKit debugger models.
- Normalize contract events into dashboard-safe records.
- Provide shared event type constants and payload builders.

Suggested structure:

```txt
packages/stellar/src/
  network.ts
  ids.ts
  registryClient.ts
  transactionParser.ts
  eventParser.ts
  webhookPayloads.ts
  types.ts
```

### 4.4 Soroban Contract: `contracts/registry`

Add a Rust Soroban contract package:

```txt
contracts/registry/
  Cargo.toml
  src/lib.rs
  src/types.rs
  src/errors.rs
  tests/
```

Contract name: `stellar_kit_registry`

Required functions:

```txt
register_project(name, metadata_hash)
update_project(project_id, metadata_hash)
add_contract(project_id, contract_id)
remove_contract(project_id, contract_id)
transfer_ownership(project_id, new_owner)
deactivate_project(project_id)
get_project(project_id)
get_project_contracts(project_id)
```

On-chain model:

```rust
pub struct Project {
    pub id: u64,
    pub owner: Address,
    pub name: String,
    pub metadata_hash: BytesN<32>,
    pub active: bool,
    pub created_ledger: u32,
}
```

Contract invariants:

- `project_id` is generated monotonically by contract storage.
- Mutations require `owner.require_auth()`.
- Contract IDs cannot be duplicated within a project.
- Inactive projects cannot add new official contracts.
- Reads require no auth.
- Project name length should be bounded.
- Official contract count per project should be bounded for MVP.

## 5. Data Architecture

### 5.1 Authority Model

On-chain is authoritative for:

- Project owner.
- Project active/inactive status.
- Project name stored in registry.
- Metadata hash.
- Official contract IDs.
- Created ledger.

Convex is authoritative for:

- Dashboard-only project settings.
- Public metadata body that hashes to `metadata_hash`.
- Slug and public URL.
- Webhook URLs and delivery logs.
- Cached recent events.
- Cached transaction debug results.
- Polling cursors and operational state.

When Convex and registry state disagree, UI should label the Convex state as stale and prefer registry values for trust badges.

### 5.2 Convex Tables

Recommended MVP schema:

```txt
projects
  ownerAddress: string
  slug: string
  name: string
  description?: string
  website?: string
  metadataJson: string
  metadataHash: string
  registryProjectId?: number
  registryContractId: string
  registrationStatus: "draft" | "pending" | "registered" | "inactive" | "error"
  registrationTxHash?: string
  lastRegistrySyncAt?: number
  createdAt: number
  updatedAt: number

projectContracts
  projectId: Id<"projects">
  contractId: string
  status: "pending" | "active" | "removed" | "error"
  addTxHash?: string
  removeTxHash?: string
  createdAt: number
  updatedAt: number

transactions
  hash: string
  network: "testnet"
  status: string
  ledger?: number
  envelopeXdr?: string
  resultXdr?: string
  feeCharged?: string
  resourceSummary?: object
  parsedSummary?: object
  errorMessage?: string
  fetchedAt: number

contractEvents
  projectId?: Id<"projects">
  contractId: string
  transactionHash: string
  ledger: number
  timestamp?: number
  topic: string
  type: string
  raw: object
  decoded?: object
  observedAt: number

webhookEndpoints
  projectId: Id<"projects">
  urlEncryptedOrPrivate: string
  enabled: boolean
  eventTypes: string[]
  createdAt: number
  updatedAt: number

webhookDeliveries
  projectId: Id<"projects">
  endpointId: Id<"webhookEndpoints">
  eventType: string
  destinationHost: string
  payloadSummary: object
  status: "pending" | "success" | "failed"
  httpStatus?: number
  errorMessage?: string
  attemptCount: number
  lastAttemptAt: number
  createdAt: number

pollerState
  scope: string
  projectId?: Id<"projects">
  contractId?: string
  lastLedger?: number
  lastRunAt?: number
  status: "idle" | "polling" | "stale" | "error"
  errorMessage?: string
```

Indexes:

- `projects.by_ownerAddress`
- `projects.by_slug`
- `projects.by_registryProjectId`
- `projectContracts.by_projectId`
- `projectContracts.by_contractId`
- `transactions.by_hash`
- `contractEvents.by_projectId_ledger`
- `contractEvents.by_contractId_ledger`
- `contractEvents.by_transactionHash`
- `webhookEndpoints.by_projectId`
- `webhookDeliveries.by_projectId_createdAt`
- `pollerState.by_scope`

### 5.3 Metadata Hash

Use canonical JSON for public metadata:

```json
{
  "name": "DemoPay",
  "description": "...",
  "website": "https://...",
  "logoUrl": "https://..."
}
```

Architecture decision:

- Canonicalize metadata by sorting object keys and using UTF-8 JSON without insignificant whitespace.
- Hash with SHA-256.
- Store the 32-byte hash on-chain.
- Store the full metadata JSON in Convex.

This gives a simple integrity link between public off-chain metadata and the on-chain registry.

## 6. Core Flows

### 6.1 Register Project

1. User connects Freighter.
2. Web app creates a Convex `projects` draft record with metadata hash.
3. Web app asks `packages/stellar` to build `register_project(name, metadata_hash)`.
4. User signs with Freighter.
5. Web app submits transaction to Testnet.
6. Convex marks project `pending` with transaction hash.
7. `registrySync` confirms transaction and extracts or resolves `registryProjectId`.
8. Convex marks project `registered`.
9. Public page becomes shareable at `/verify/[slug]`.

### 6.2 Add Official Contract

1. Owner enters contract ID.
2. UI validates contract ID format before submission.
3. Web app builds `add_contract(project_id, contract_id)`.
4. Owner signs and submits.
5. Convex writes `projectContracts` as `pending`.
6. Sync confirms registry state.
7. Dashboard and public page show the active contract.

### 6.3 Public Verification Page

1. Public page loads by slug.
2. Convex public query returns safe metadata and cached registry state.
3. Backend optionally refreshes registry state in the background.
4. UI displays verified, unverified, inactive, stale, or unavailable status.
5. Webhook URLs and dashboard settings are never returned.

### 6.4 Transaction Debugger

1. User submits transaction hash.
2. Web app validates hash format.
3. Convex action fetches transaction from Stellar RPC.
4. Parser normalizes status, operations, events, fee, resources, and errors.
5. Convex caches the result.
6. UI renders parsed sections and clear failure states.

XDR paste should be deferred unless the hash path is complete. If implemented, it should parse client-side or through a dedicated backend action and label unsupported envelope versions clearly.

### 6.5 Event Monitor

1. Scheduled Convex job finds active contracts for registered projects.
2. Job polls recent contract events from Stellar RPC using a bounded ledger window.
3. Events are normalized and upserted by `(contractId, transactionHash, ledger, topic)`.
4. Matching webhook events are enqueued as delivery attempts.
5. Dashboard subscribes to recent `contractEvents` for the project.

MVP event history should be bounded by ledger window and page size. The product should label the monitor as polling, stale, live, or error based on `pollerState`.

### 6.6 Webhook Delivery

1. User configures webhook URL for a project.
2. Convex validates protocol and stores it privately.
3. Event monitor creates webhook payloads for selected event types.
4. Convex action sends HTTP POST.
5. Each attempt writes a `webhookDeliveries` record.
6. Dashboard shows timestamp, event type, destination host, status, HTTP code, and payload summary.

MVP delivery policy:

- One immediate attempt.
- Optional one manual retry from dashboard.
- Store destination host in logs, not full sensitive URL.
- Do not expose webhook configuration on public routes.

## 7. Security Architecture

- Registry mutations rely on Soroban `Address.require_auth()`.
- Frontend owner checks are convenience checks only.
- Convex owner dashboard reads should require the connected wallet address to match the project owner address.
- Public queries must use dedicated return models with only public fields.
- Webhook URLs should be treated as secrets and omitted from public pages and payload summaries.
- SSRF protection for webhook URLs should block localhost, private IP ranges, and non-HTTP protocols before production. For hackathon MVP, at minimum allow only `https://` and optionally `http://` for local demo mode.
- API keys are deferred. If added, store only hashed keys and scope them to project IDs.

## 8. Reliability, Performance, and Observability

Reliability:

- All RPC calls return typed states: success, missing, pending, failed, unavailable.
- Cache successful transaction lookups and recent events.
- Show stale-state banners when registry sync or event polling fails.

Performance:

- Public and dashboard initial views must query bounded data only.
- Recent events should load with limit-based pagination.
- Transaction debugger should cache by hash to avoid repeated RPC calls during demo.

Observability:

- Log transaction lookup failures in Convex.
- Log every webhook delivery attempt.
- Track poller state per project or contract.
- Surface error messages as developer-readable status text.

## 9. Implementation Plan

### Phase 1: Foundation

- Add `contracts/registry` Soroban contract.
- Add `packages/stellar` shared package.
- Replace Convex todo schema with TalaKit schema.
- Add environment config for Testnet RPC and registry contract ID.

### Phase 2: Verify

- Implement wallet connection.
- Implement project creation.
- Implement registry transaction build/sign/submit.
- Implement registry sync.
- Implement public `/verify/[slug]` page.
- Implement official contract add/remove.

### Phase 3: Debug

- Implement transaction hash debugger.
- Parse and display status, operations, events, fees, resources, and failures.
- Cache debugger results and failure diagnostics.

### Phase 4: Monitor and Webhooks

- Implement bounded event polling.
- Implement event dashboard.
- Implement webhook endpoint configuration.
- Implement webhook delivery action and logs.

### Phase 5: Polish and Demo Hardening

- Add empty, pending, stale, and error states.
- Add demo seed guidance and sample contract notes.
- Validate accessibility for keyboard navigation and status text.
- Decide public name: TalaKit or StellarKit.

## 10. Future Architecture Path

Developer beta:

- API keys and scoped request logs.
- RPC gateway endpoint.
- Webhook signing, idempotency keys, retry/backoff, and dead-letter handling.
- Richer event filters and longer history.
- Team projects and roles.

Production:

- PostgreSQL for canonical indexed blockchain data.
- ClickHouse for high-volume request logs and analytics.
- Redis or managed queue for rate limiting, webhook dispatch, and background work.
- Multi-network support with explicit network partitioning in all tables.
- Dedicated indexer services beyond Convex scheduled jobs.

## 11. Open Architecture Questions

- Product name: use TalaKit publicly, or rename to StellarKit throughout.
- Wallet strategy: Freighter-only for MVP, or wallet-kit abstraction.
- Public route: `/verify/[slug]` is recommended, but final UX may choose `/p/[slug]` or `/projects/[slug]`.
- Event window: choose a concrete recent ledger window for polling.
- Metadata fields: finalize the public metadata JSON shape before contract deployment.
- Webhook signing: recommended for beta, not required for hackathon MVP.
- Demo contract: decide whether to ship a sample Soroban contract for repeatable event generation.

## 12. Acceptance Mapping

| PRD Acceptance Criteria | Architecture Support |
| --- | --- |
| Create project, connect wallet, register on-chain | Web wallet flow, Convex project draft, registry contract client |
| Add official contract ID | `add_contract` contract function, `projectContracts` table |
| Public page without wallet | `/verify/[slug]` public query model |
| Debug transaction hash | `transactions.ts`, Stellar RPC action, parser package |
| Dashboard recent activity | scheduled event polling and `contractEvents` table |
| Configure webhook and see delivery log | `webhookEndpoints`, `webhookDeliveries`, delivery action |
| Reject non-owner mutations | Soroban `require_auth()` invariant |
| Optional RPC gateway does not block MVP | deferred to developer beta |

