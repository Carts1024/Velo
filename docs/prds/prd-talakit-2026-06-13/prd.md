---
title: "PRD: Velo Verify + Debug"
status: draft
created: 2026-06-13
updated: 2026-06-13
source_inputs:
  - README.md
  - FOLDER_STRUCTURE.md
---

# PRD: Velo Verify + Debug

## 1. Summary

Velo is a developer operations platform for Stellar and Soroban applications. The hackathon MVP focuses on **Verify + Debug**: a workflow that lets Soroban builders register official project contracts, publish a verified project page, inspect transaction activity, monitor contract events, and demonstrate webhook delivery from a single dashboard.

The product addresses the gap between raw Stellar infrastructure and the operational tooling developers need after deployment. Stellar already provides SDKs, RPC endpoints, explorers, and documentation; Velo packages verification, debugging, event visibility, and webhook evidence into an approachable developer workflow.

## 2. Goals

### Product Goals

- Help Soroban developers prove which contracts officially belong to a project.
- Reduce time spent stitching together RPC calls, explorers, event indexers, databases, webhook workers, and debugging scripts.
- Provide a hackathon-ready demo path that shows project registration, contract verification, transaction inspection, event monitoring, and webhook logs.
- Establish a foundation for a later developer beta with RPC request logs, richer webhooks, and team projects (Project API Keys implemented in Phase 1).

### Non-Goals

- Replace Stellar SDKs, Stellar Laboratory, StellarExpert, public RPC endpoints, or existing Stellar documentation.
- Provide production-grade indexing, alerting, billing, or SLA-backed RPC in the hackathon MVP.
- Support every Stellar network or wallet provider in the first release.
- Build a generalized block explorer.

## 3. Target Users

### Primary Persona: Soroban Developer

The primary user is a developer building or demoing a Soroban-powered app. They need to register official contract IDs, debug transactions, inspect emitted events, and prove project authenticity to teammates, users, judges, or integrators.

### Secondary Personas

- **Hackathon team:** Needs a fast, convincing way to demonstrate official contracts and live activity.
- **Payment app developer:** Needs webhook notifications and delivery evidence for contract or transaction activity.
- **Wallet or explorer integrator:** Wants registry-backed project metadata to show safer contract context.
- **Fintech builder:** Wants audit-friendly logs for transaction activity, event delivery, and project metadata.

## 4. Problem Statement

Building production-ready Stellar apps requires custom workflow infrastructure. Developers often need to answer:

- Is this the official contract for this project?
- Who owns this app or contract?
- What happened in this transaction?
- Why did this transaction fail?
- What events did my contract emit?
- Did my backend receive the event notification?
- Can I monitor my app without manually polling Stellar RPC?

Today, teams commonly solve these questions by combining RPC calls, explorers, scripts, indexers, databases, and webhook jobs. This creates repeated work and weakens trust for users and integrators.

## 5. MVP Scope

The MVP is **Velo Verify + Debug** for Stellar Testnet and Soroban apps.

### In Scope

- Wallet connection for a Soroban-compatible wallet, with Freighter as the assumed first wallet. [ASSUMPTION]
- Project creation in the off-chain dashboard.
- On-chain project registration through a Soroban registry contract.
- Official contract ID management.
- Public verified project page.
- Project dashboard with recent contract activity.
- Transaction hash lookup.
- Basic transaction status, operation, event, fee, resource, and failure display where available from Stellar RPC.
- Contract event monitoring for registered contracts.
- Webhook URL configuration.
- Webhook delivery log display for demoable event notifications.
- API key generation and developer APIs for event monitoring and transaction lookup.

### Optional MVP Scope

- Basic RPC gateway or request logger.
- Event filtering beyond simple project, contract, event type, transaction hash, and ledger filters.
- Simple error explanation engine.

## 6. User Journeys

### UJ-1: Register and Verify a Project

1. Developer opens Velo.
2. Developer connects a wallet.
3. Developer creates a project with a name and metadata.
4. Developer submits an on-chain registration transaction.
5. Velo confirms registration and stores off-chain dashboard data.
6. Developer adds one or more official Soroban contract IDs.
7. Velo publishes a verified project page showing ownership, status, and contract IDs.

### UJ-2: Debug a Transaction

1. Developer opens the transaction debugger.
2. Developer pastes a transaction hash or XDR.
3. Velo fetches and parses available transaction data.
4. Developer sees transaction status, operation breakdown, contract calls, events, fees, resource usage, and failure reason when available.
5. Developer uses the result to understand what happened without writing a custom script.

### UJ-3: Monitor Events and Webhook Delivery

1. Developer opens a registered project dashboard.
2. Velo shows recent events for linked contract IDs.
3. Developer configures a webhook URL for project activity.
4. Velo sends a webhook when a supported event is observed.
5. Developer checks the delivery log to confirm payload, status, timestamp, and failure details when relevant.

### UJ-4: Hackathon Demo

1. Developer creates a demo project named `DemoPay`.
2. Developer connects a Stellar wallet.
3. Developer registers the project through the Soroban registry.
4. Developer adds the official `DemoPay` contract ID.
5. Velo shows a public verified project page.
6. Developer looks up a sample transaction.
7. Velo displays transaction status and emitted events.
8. Velo sends a webhook notification to a developer backend.
9. Dashboard shows the webhook delivery log.

## 7. Functional Requirements

### F1. Wallet Connection

- **FR-001:** The app must let a developer connect a Soroban-compatible wallet.
- **FR-002:** The app must display the connected wallet address after connection.
- **FR-003:** The app must use the connected wallet as the project owner for on-chain registration.
- **FR-004:** The app must handle wallet disconnect, unavailable wallet, rejected signature, and failed submission states.

### F2. Project Creation and Dashboard

- **FR-005:** The app must let a developer create a Velo project with at least a project name.
- **FR-006:** The app must store off-chain project details needed by the dashboard.
- **FR-007:** The app must show a project dashboard after creation.
- **FR-008:** The dashboard must show project name, owner wallet, on-chain registration status, linked contract IDs, recent activity, and webhook delivery status.
- **FR-009:** The dashboard must make unregistered, registered, inactive, and error states visually distinct.

### F3. Soroban Project Registry

- **FR-010:** The Soroban registry contract must support `register_project(name, metadata_hash)`.
- **FR-011:** The registry contract must support `update_project(project_id, metadata_hash)`.
- **FR-012:** The registry contract must support `add_contract(project_id, contract_id)`.
- **FR-013:** The registry contract must support `remove_contract(project_id, contract_id)`.
- **FR-014:** The registry contract must support `transfer_ownership(project_id, new_owner)`.
- **FR-015:** The registry contract must support `deactivate_project(project_id)`.
- **FR-016:** The registry contract must support `get_project(project_id)`.
- **FR-017:** The registry contract must support `get_project_contracts(project_id)`.
- **FR-018:** The registry must store project ID, owner address, project name, metadata hash, official contract IDs, active status, and created ledger.
- **FR-019:** Only the project owner must be able to update metadata, add contracts, remove contracts, transfer ownership, or deactivate the project.
- **FR-020:** Registry reads must be available without wallet connection.

### F4. Official Contract Management

- **FR-021:** A registered project owner must be able to add an official Soroban contract ID.
- **FR-022:** A registered project owner must be able to remove an official Soroban contract ID.
- **FR-023:** The app must prevent or flag invalid contract ID inputs before transaction submission where practical.
- **FR-024:** The app must show pending, success, and failure states for contract add/remove transactions.
- **FR-025:** The project dashboard and public page must reflect current official contract IDs after confirmation.

### F5. Public Verified Project Page

- **FR-026:** Each registered project must have a public verification page.
- **FR-027:** The public page must show project name, owner wallet address, registered contract IDs, active status, and project metadata.
- **FR-028:** The public page must clearly indicate whether the project is verified, unverified, inactive, or unavailable.
- **FR-029:** The public page must show recent contract activity when available.
- **FR-030:** The public page must be viewable without wallet connection.

### F6. Transaction Debugger

- **FR-031:** The app must let a developer paste a transaction hash.
- **FR-032:** The app should let a developer paste transaction XDR if feasible in the MVP. [ASSUMPTION]
- **FR-033:** The debugger must display transaction status.
- **FR-034:** The debugger must display operation breakdown where available.
- **FR-035:** The debugger must display contract function calls where available.
- **FR-036:** The debugger must display emitted events where available.
- **FR-037:** The debugger must display fees and resource usage where available.
- **FR-038:** The debugger must display failure reason where available.
- **FR-039:** The debugger should provide concise human-readable hints for common failure cases.
- **FR-040:** The debugger must handle missing, malformed, pending, failed, and RPC unavailable states.

### F7. Contract Event Monitor

- **FR-041:** The app must monitor recent events for contracts linked to registered projects.
- **FR-042:** The event monitor must show event name or topic, contract ID, transaction hash, ledger, timestamp where available, and decoded or raw data.
- **FR-043:** The event monitor must support filtering by project, contract ID, event type, transaction hash, and ledger number.
- **FR-044:** The event monitor must clearly distinguish live, polling, stale, and error states.
- **FR-045:** The MVP may limit event history depth to a bounded recent window. [ASSUMPTION]

### F8. Webhooks

- **FR-046:** A developer must be able to configure a webhook URL for a project.
- **FR-047:** Velo must support webhook event types `contract.event`, `transaction.succeeded`, `transaction.failed`, `project.registered`, and `project.updated`.
- **FR-048:** Velo must send webhook payloads containing type, project ID, contract ID when relevant, transaction hash when relevant, ledger, and event data.
- **FR-049:** Velo must show webhook delivery logs with timestamp, event type, destination URL, HTTP status or failure reason, and payload summary.
- **FR-050:** The MVP must support a demoable webhook delivery path even if retry logic is limited.
- **FR-051:** The app must avoid exposing webhook secrets or sensitive URL components on public pages.

### F9. RPC Request Logs and API Keys

- **FR-052:** The app must let developers generate a Project API Key, showing it only once upon generation and masking it (prefix/created date) on subsequent loads.
- **FR-052.1:** The app must expose developer API endpoints (`/api/v1/events`, `/api/v1/transactions/[hash]`, `/api/v1/webhooks/deliveries`) that authenticate requests using the Project API Key.
- **FR-053:** If included in later phases, the app must log selected RPC method, timestamp, status, latency, project, API key, and error message.
- **FR-054:** If included in later phases, request logs must be scoped to the owning project.
- **FR-055:** RPC gateway request logs are optional for the hackathon demo.

## 8. Non-Functional Requirements

- **NFR-001 Reliability:** Core demo flows must tolerate Stellar RPC transient failures with clear retry or recovery messaging.
- **NFR-002 Performance:** Dashboard and public page initial views should load in under 3 seconds on normal broadband for bounded MVP data.
- **NFR-003 Security:** Owner-only registry mutations must be enforced by the Soroban contract, not only by frontend checks.
- **NFR-004 Privacy:** Webhook URLs, API keys, and private dashboard settings must not appear on public verified pages.
- **NFR-005 Data Integrity:** On-chain registry data is authoritative for project ownership, active status, and official contract IDs.
- **NFR-006 Observability:** Webhook delivery attempts and transaction lookup failures must be logged enough for a developer to diagnose the demo.
- **NFR-007 Accessibility:** Core dashboard actions must be keyboard navigable and use readable status text, not color alone.
- **NFR-008 Testnet Support:** The MVP must target Stellar Testnet unless a later decision explicitly adds other networks.
- **NFR-009 Bounded Reads:** Backend event and log queries must be bounded or paginated to avoid unbounded collection growth.

## 9. Data Requirements

### On-Chain Registry Data

- Project ID
- Owner address
- Project name
- Metadata hash
- Official contract IDs
- Active status
- Created ledger

### Off-Chain Dashboard Data

- Project details not stored on-chain
- Public metadata
- Dashboard settings
- Webhook URLs
- Webhook delivery logs
- Indexed or recently fetched events
- Optional API keys
- Optional RPC request logs

## 10. Success Metrics

- A first-time developer can complete the `DemoPay` journey in under 10 minutes after prerequisites are installed. [ASSUMPTION]
- Hackathon demo can show all of these in one flow: wallet connection, project registration, contract linking, public verified page, transaction lookup, event display, and webhook delivery log.
- Transaction debugger returns a useful result or a clear failure state for at least 90% of valid Testnet transaction hashes tested during demo prep. [ASSUMPTION]
- Webhook delivery log records 100% of attempted demo webhook deliveries.
- Public verified project pages require no wallet connection and can be shared by URL.

### Counter-Metrics

- Demo flow should not require manual database edits.
- Public pages must not leak webhook URLs or API keys.
- Optional RPC gateway work must not delay project verification or transaction debugging.

## 11. Release Phases

### Phase 1: Hackathon MVP

- Soroban project registry.
- Wallet connection.
- Project dashboard.
- Official contract linking.
- Public verified project page.
- Basic transaction lookup.
- Basic event monitor.
- Simple webhook demo.
- Project API Keys and Developer APIs.

### Phase 2: Developer Beta

- RPC gateway.
- Request logs.
- Better transaction debugging.
- Webhook retries.
- Event filters.
- Team projects.

### Phase 3: Production Platform

- Hosted reliable RPC.
- Advanced indexer APIs.
- Long-term event history.
- Usage analytics.
- Billing.
- Dedicated endpoints.
- SLA and alerting.

## 12. Risks and Mitigations

- **RPC availability risk:** Testnet RPC instability could break demo flows. Mitigation: cache recent successful lookups where appropriate and show clear fallback states.
- **Scope risk:** API keys, RPC gateway, and rich filtering can distract from Verify + Debug. Mitigation: keep them optional until the core demo is complete.
- **Trust risk:** Off-chain data could diverge from on-chain registry state. Mitigation: treat on-chain data as authoritative and label stale sync states.
- **Webhook demo risk:** External endpoints may fail. Mitigation: record every attempt and show delivery status clearly.
- **Naming risk:** Repo name, README title, and product copy currently mix Velo and StellarKit. Mitigation: choose one public name before UX design and docs polish.

## 13. Open Questions

- Should the customer-facing product name be Velo or StellarKit?
- Which wallet is the required first wallet for the hackathon demo: Freighter only, or a wallet-kit abstraction?
- Is XDR paste required for MVP, or is transaction hash lookup enough?
- What is the acceptable recent-event history window for MVP?
- Should webhook payload signing be included in MVP, or deferred to developer beta?
- What project metadata fields belong on-chain as a hash versus off-chain in Convex?
- Which route structure should public verified pages use?
- Does the demo require a live sample Soroban contract, or can it use an existing Testnet contract?

## 14. Acceptance Criteria

- A developer can create a project, connect a wallet, and register the project on-chain.
- A developer can add at least one official contract ID to the registered project.
- A public page displays the project owner, active status, and official contract ID without requiring wallet connection.
- A developer can paste a valid Testnet transaction hash and see transaction status plus available events.
- A project dashboard displays recent activity for at least one linked contract.
- A developer can configure a webhook URL and see at least one delivery attempt in logs.
- Owner-only registry mutations are rejected for non-owner accounts.
- Optional API key and RPC gateway work does not block the acceptance of the above criteria.
