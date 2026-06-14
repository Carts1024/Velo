---
title: "Phase 1 Sprint Plan: TalaKit Verify + Debug"
status: draft
created: 2026-06-13
updated: 2026-06-13
project_name: TalaKit
inputDocuments:
  - docs/prds/prd-talakit-2026-06-13/prd.md
  - docs/prds/prd-talakit-2026-06-13/architecture.md
  - docs/prds/prd-talakit-2026-06-13/ux-design-specification.md
  - contracts/registry/src/lib.rs
  - contracts/registry/tests/registry.rs
---

# Phase 1 Sprint Plan: TalaKit Verify + Debug

## 1. Planning Intent

Phase 1 should be built as a sequence of small, demoable increments. Each sprint must leave the product in a state that is easier to demo than before. Optional scope stays outside the critical path until the core Verify + Debug loop works end to end.

The Phase 1 demo path is:

```txt
Connect wallet
  -> create project
  -> register project on-chain
  -> add official contract ID
  -> view public verified page
  -> inspect transaction
  -> view recent events
  -> configure webhook
  -> show delivery log
```

## 2. Sprint Rules

- Ship vertical slices, not isolated UI shells.
- Keep Stellar Testnet as the only Phase 1 network.
- Treat on-chain registry data as authoritative for project owner, active status, metadata hash, and official contract IDs.
- Keep API keys, RPC gateway, request logs, advanced filters, retries, billing, and team projects out of the Phase 1 critical path.
- Use `packages/ui/src` for UI primitives and compose TalaKit-specific components in `apps/web/features/*`.
- Every sprint must include loading, empty, failed, and stale states for the user-facing flows it touches.

## 3. Sprint Overview

| Sprint | Name | Primary Outcome | Demo Checkpoint |
| --- | --- | --- | --- |
| 0 | Product and Dev Readiness | Decisions, routes, env, and data contracts are pinned. | App shell opens with placeholder routes and Testnet config visible. |
| 1 | Registry Foundation | Soroban registry contract is complete and tested. | Register DemoPay and add/remove a contract in tests/local flow. |
| 2 | Project System and Multi-Wallet | Developer can connect a supported Stellar wallet and create a draft project. | Selected wallet and address appear; draft project appears in dashboard. |
| 3 | On-Chain Registration Flow | Draft project can be registered on-chain and synced back. | Project moves from draft/pending to verified. |
| 4 | Contract Linking and Public Proof | Owner can add official contracts; public page proves them. | Share `/verify/[slug]` showing owner and contract IDs. |
| 5 | Transaction Debugger | Developer can inspect a Testnet transaction hash. | Debugger shows status, fees, operations/events, and failure states. |
| 6 | Event Monitor | Project dashboard shows recent events for linked contracts. | Event table displays bounded recent activity with details. |
| 7 | Webhook Demo | Developer can configure a webhook and see delivery logs. | Test or observed event creates a visible webhook delivery log. |
| 8 | Demo Hardening | Flow is polished, resilient, and hackathon-ready. | DemoPay journey runs end to end without manual database edits. |

## 4. Sprint Details

### Sprint 0: Product and Dev Readiness

Status: Complete as of 2026-06-13.

Goal: remove avoidable ambiguity before implementation work accelerates.

Scope:

- Confirm customer-facing name for Phase 1 UI: `TalaKit` unless explicitly changed.
- Confirm Stellar Wallets Kit as the wallet integration layer, with Freighter as the first validated wallet target.
- Confirm transaction hash lookup is required; XDR paste remains optional unless capacity allows.
- Confirm public route format: `/verify/[slug]`.
- Confirm webhook signing and retries are deferred.
- Ensure app can import shared UI components from `@repo/ui`.
- Define environment variables for Stellar Testnet RPC, registry contract ID, Convex URL, and wallet/network config.
- Create placeholder routes for the required Phase 1 screens.

Acceptance criteria:

- [x] Phase 1 open questions that block implementation have an answer or explicit `[DEFERRED]` status.
- [x] `apps/web` has route placeholders matching the UX route map.
- [x] Testnet network config is centralized and not duplicated in page components.
- [x] Shared UI import style is verified with at least one component from `packages/ui/src`.

Outputs:

- `docs/prds/prd-talakit-2026-06-13/sprint-0-readiness-decisions.md`
- `apps/web/core/config/stellar.ts`
- Placeholder routes under `apps/web/app`
- Shared UI import verification through `apps/web/features/readiness/placeholder-page.tsx`

Dependencies:

- PRD, architecture, and UX spec.

### Sprint 1: Registry Foundation

Goal: complete the trust anchor for project verification.

Current status:

- `contracts/registry/src/lib.rs` already implements project registration, metadata updates, contract add/remove, ownership transfer, deactivation, reads, owner auth, name limits, contract limits, and storage TTL handling.
- `contracts/registry/tests/registry.rs` already covers registration, contract add/remove, duplicate rejection, inactive project behavior, ownership transfer, invalid names, and non-owner mutation rejection.

Scope:

- Finish or verify registry events for project registration, updates, contract add/remove, ownership transfer, and deactivation.
- Confirm public contract function signatures match frontend expectations.
- Add tests for missing project reads/mutations if not already present.
- Add tests for contract limit behavior.
- Add tests for removing a non-existent contract.
- Add build/deploy notes for Testnet.
- Record deployed Testnet registry contract ID when available.

Acceptance criteria:

- Registry contract tests pass.
- Owner-only mutations are enforced by the contract.
- Reads require no auth.
- Contract emits enough events for the backend to observe registration and contract changes.
- Deployment command and resulting contract ID are documented.

Dependencies:

- Rust/Soroban toolchain.

### Sprint 2: Project System and Multi-Wallet

Goal: create the off-chain project backbone and first dashboard loop.

Scope:

- Implement Convex schema for `projects`.
- Add project create/update queries and mutations for draft projects.
- Add Stellar Wallets Kit as the Phase 1 wallet integration layer.
- Initialize Stellar Wallets Kit only in the browser using Testnet config and the default wallet modules.
- Implement wallet connection UI using the kit's modal/button flow, starting with Freighter support but not hard-coding the app to Freighter-only APIs.
- Listen for wallet state updates and disconnect events so the app shell, dashboard, and project owner scope stay in sync.
- Show selected wallet name/id and connected wallet address in app shell.
- Build dashboard home with empty state and project table.
- Build create project form using shared UI components.
- Generate slug and metadata hash from project metadata.
- Create a small wallet service/hook boundary that exposes `connect`, `disconnect`, `address`, `walletId`, and future `signTransaction` capability without leaking kit details into page components.

Acceptance criteria:

- Developer can connect and disconnect using Stellar Wallets Kit on Testnet.
- Developer can connect with Freighter through the kit, and the UI is ready to show other default supported wallets when available.
- Developer can create a draft project with name, slug, description, website, metadata JSON, and metadata hash.
- Dashboard lists draft projects scoped to the connected owner wallet.
- Wallet unavailable, unsupported wallet, rejected connection, disconnected, and stale wallet-session states are visible.
- Selected wallet id/name and shortened public address are visible after connection.
- Draft project creation does not require an on-chain transaction yet.
- Wallet initialization does not run during server-side rendering or pre-rendering.

Dependencies:

- Sprint 0.

### Sprint 3: On-Chain Registration Flow

Goal: turn a draft project into a verified registered project.

Scope:

- Add `packages/stellar` helpers for Testnet config, ID validation, and registry transaction construction.
- Build `register_project` transaction from draft metadata.
- Reuse the Sprint 2 Stellar Wallets Kit boundary for signing and transaction submission.
- Pass the Testnet network passphrase and active wallet address explicitly when requesting signatures.
- Store pending registration transaction hash in Convex.
- Implement registry sync to confirm registration and persist `registryProjectId`.
- Add dashboard states: draft, pending, registered, error, stale.

Acceptance criteria:

- Developer can register a draft project on-chain.
- UI shows pending, success, rejected signature, failed submission, and RPC unavailable states.
- Convex stores registration transaction hash and final registry project ID.
- Project dashboard shows owner wallet, registry status, metadata hash, created ledger when available, and last sync.
- No manual database edit is required to move from draft to registered.

Dependencies:

- Sprint 1.
- Sprint 2.

### Sprint 4: Contract Linking and Public Proof

Goal: make the core verification value visible.

Scope:

- Implement Convex `projectContracts` table.
- Add contract ID validation.
- Build add/remove official contract transactions.
- Add contracts screen.
- Add contract table to project dashboard.
- Implement public verification query that returns only safe public data.
- Build `/verify/[slug]` public verified project page.
- Add stale/mismatch state when metadata hash or registry data does not align.

Acceptance criteria:

- Owner can add at least one official contract ID to a registered project.
- Owner can remove an official contract ID with confirmation.
- Public page shows project name, owner wallet, active status, registry project ID, metadata hash, and official contract IDs without wallet connection.
- Public page never returns webhook URLs, API keys, or dashboard-only settings.
- Project dashboard and public page update after contract confirmation.

Dependencies:

- Sprint 3.

### Sprint 5: Transaction Debugger

Goal: give developers a useful transaction inspection tool independent of project setup.

Scope:

- Add Convex `transactions` table/cache.
- Add Stellar RPC action for transaction lookup.
- Add parser for status, ledger, fee, operations, contract calls, events, result code, and failure reason where available.
- Build `/debug` screen.
- Add concise failure hints for common parser/RPC outcomes.
- Add raw response expandable section.

Acceptance criteria:

- Developer can paste a valid Testnet transaction hash and get a result or clear failure state.
- Malformed hash, transaction not found, pending, RPC unavailable, and decode unsupported states are visible.
- Transaction results show status, transaction hash, ledger, fee, operations/events when available, and failure reason when available.
- Cached lookup result can be reused for repeat views.

Dependencies:

- Sprint 0.
- Can run in parallel with Sprint 4 if contract registration is stable.

### Sprint 6: Event Monitor

Goal: show recent activity for linked official contracts.

Scope:

- Add Convex `contractEvents` and `pollerState` tables.
- Implement bounded event polling for linked contract IDs.
- Normalize event records into dashboard-safe shape.
- Build project events screen.
- Add event preview to project dashboard and public page where safe.
- Add event detail sheet with decoded/raw payload.

Acceptance criteria:

- Project events screen shows recent events for linked contracts.
- Event records include event/topic, contract ID, transaction hash, ledger, observed time, and raw or decoded data.
- UI distinguishes live, polling, stale, empty, and error states.
- Queries are bounded or paginated.
- Public page can show recent public activity without leaking private settings.

Dependencies:

- Sprint 4.

### Sprint 7: Webhook Demo

Goal: prove event delivery to a developer backend.

Scope:

- Add Convex `webhookEndpoints` and `webhookDeliveries` tables.
- Build webhook settings screen.
- Store webhook URL privately.
- Implement event type selection for `contract.event`, `transaction.succeeded`, `transaction.failed`, `project.registered`, and `project.updated`.
- Implement a demoable delivery action.
- Build delivery logs table and detail sheet.
- Add webhook summary to project dashboard.

Acceptance criteria:

- Developer can configure a webhook URL for a project.
- Developer can send a test event or trigger delivery from observed activity.
- Delivery logs show timestamp, event type, destination host, HTTP status or failure reason, attempt count, and payload summary.
- Full webhook URL is not shown on public pages.
- At least one delivery attempt can be shown during the DemoPay journey.

Dependencies:

- Sprint 6 for observed `contract.event` delivery.
- Can use test event path before Sprint 6 is fully complete.

### Sprint 8: Demo Hardening

Goal: make the hackathon demo reliable and coherent.

Scope:

- Build a DemoPay checklist in project dashboard.
- Add copy buttons for all wallet addresses, contract IDs, hashes, and public URLs.
- Add skeleton, empty, error, stale, and retry states across core screens.
- Add privacy pass for public queries and pages.
- Add accessibility pass for keyboard navigation, focus states, labels, and status text.
- Prepare demo seed data or documented setup flow.
- Verify no optional MVP work blocks the demo.

Acceptance criteria:

- DemoPay journey completes end to end in under 10 minutes after prerequisites are ready.
- No manual database edits are required during demo.
- Public verified page can be shared by URL and viewed without wallet connection.
- Webhook delivery log records every attempted demo delivery.
- Core screens use shared `packages/ui/src` components consistently.
- Known limitations are documented in the PRD or sprint plan, not hidden in the product.

Dependencies:

- Sprints 1-7.

Implementation notes:

- The project dashboard includes a six-step DemoPay readiness checklist derived from live project, contract, event, public proof, and webhook state.
- Shared copy controls cover displayed wallet addresses, contract IDs, transaction hashes, metadata hashes, and public proof URLs.
- Core project, event, webhook, debugger, and public proof screens distinguish loading, empty, stale, error, and retry/continue states.
- Public queries return explicit safe projections and exclude webhook settings, delivery logs, raw event payloads, and poller errors.
- The repeatable setup and timed flow are documented in `demo-setup.md`.

Known limitations:

- Phase 1 supports Stellar Testnet only.
- Hosted Convex webhook delivery cannot reach localhost; the demo requires a deployed HTTPS endpoint or tunnel.
- Webhook retries and signing remain deferred. Every manual send creates one delivery attempt record.
- Event polling is bounded and may report stale during RPC delays.
- Demo data is prepared through the documented wallet-signed flow rather than database seeding.

## 5. Cut Line

If time gets tight, protect these in order:

1. Registry contract and owner-only proof.
2. Wallet connection and project creation.
3. On-chain project registration.
4. Official contract linking.
5. Public verified page.
6. Transaction hash debugger.
7. Event monitor.
8. Webhook delivery log.

Cut or defer these first:

- XDR paste.
- Advanced event filters.
- API keys.
- RPC gateway.
- Request logs.
- Webhook signing.
- Webhook retries.
- Team projects.
- Mainnet/Futurenet support.

## 6. Recommended Parallel Tracks

Track A: Chain and Stellar integration

- Registry contract.
- Deployment.
- Transaction builders.
- Registry sync.
- RPC lookup and event polling.

Track B: Backend and data

- Convex schema.
- Project queries/mutations.
- Public/private query split.
- Webhook storage and delivery logs.
- Bounded event/log queries.

Track C: Frontend and UX

- App shell.
- Wallet UI.
- Project dashboard.
- Public page.
- Debugger.
- Events and webhooks.

Track D: Demo readiness

- DemoPay setup.
- Error-state rehearsal.
- Copy/share affordances.
- Final privacy/accessibility checks.

## 7. Development Entry Criteria

A sprint is ready to start when:

- Required upstream sprint acceptance criteria are met or explicitly stubbed.
- Data model fields needed by the UI are named.
- Loading, empty, failure, and success states are known.
- Testnet environment variables are available or stubbed.
- The output of the sprint can be demonstrated in the app or tests.

## 8. Phase 1 Done Criteria

Phase 1 is done when:

- A developer can create a project, connect wallet, and register it on-chain.
- A developer can add at least one official contract ID.
- A public verified page shows owner, active status, metadata, and official contracts without wallet connection.
- A developer can inspect a valid Testnet transaction hash.
- A project dashboard shows recent activity for at least one linked contract.
- A developer can configure a webhook URL and see at least one delivery attempt.
- Owner-only registry mutations are rejected for non-owner accounts.
- Public pages do not leak webhook URLs, API keys, or private dashboard settings.
