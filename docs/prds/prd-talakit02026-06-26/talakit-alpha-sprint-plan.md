---
title: "Alpha Sprint Plan: Velo Pay Stablecoin Infrastructure"
status: draft
created: 2026-06-29
updated: 2026-06-29
project_name: Velo
inputDocuments:
  - docs/prds/prd-talakit02026-06-26/talakit-alpha-spec-pay-prioritized.md
  - docs/prds/prd-talakit02026-06-26/talakit-alpha-spec.md
  - docs/prds/talakit-project-status-report-2026-06-29.md
---

# Alpha Sprint Plan: Velo Pay Stablecoin Infrastructure

## 1. Planning Intent

The Velo Alpha phase builds on top of the Phase 1 MVP foundation. Instead of deploying broad developer operations tooling, the Alpha focuses on **Velo Pay**: a developer-first stablecoin payment infrastructure layer for Stellar.

The objective is a fully functional, end-to-end demoable stablecoin payment flow:
```txt
Merchant registers project on-chain (Registry)
  -> Activates payments access on-chain (PayAccess)
  -> Configures webhook URL & generates API key
  -> Integrates Checkout SDK or copies Payment Link
  -> Customer pays USDC/test asset on hosted checkout page
  -> Velo monitors transaction, updates status, and fires signed webhook
  -> Merchant tracks payment logs and webhook delivery in dashboard
```

## 2. Sprint Rules

- **Preserve MVP Base:** Do not rewrite existing Phase 1 modules. Hardening, extension, and refactoring are preferred.
- **Demo-Friendly Limits:** Multi-wallet fallback, mainnet compliance audits, and advanced rate limiting are deferred. Focus on Testnet USDC and sandbox transactions.
- **Vertical Integration:** Each sprint must deliver a testable slice of UI + backend/contract logic.
- **Robust UI UX:** Every new page or form must include loading, success, error, and empty states. Responsive designs are mandatory for mobile-friendly checkout.

---

## 3. Sprint Overview

| Sprint | Name | Primary Outcome | Demo Checkpoint |
| --- | --- | --- | --- |
| **9** | Smart Contract Alpha | `VeloPayAccess` contract is built, tested, and deployed. | Unit tests pass; inter-contract call to `VeloRegistry` verified. |
| **10** | API Keys & Access Activation | Hashed multi-API key system + dashboard activation flow. | Owner registers access via dashboard; API key generated and stored safely. |
| **11** | PaymentIntents & Checkout Page | `paymentIntents` schema + hosted `/pay/[paymentIntentId]` page. | Open checkout link, connect customer wallet, and verify amount/receiver. |
| **12** | Checkout SDK & Snippet Builder | Lightweight `@velo/checkout` client + copy-paste integration UI. | Copy code snippet from dashboard, run script to redirect to checkout page. |
| **13** | Webhook Security & Signatures | Webhook secrets, HMAC-SHA256 signatures, and SDK verification. | Secure webhook payload generated, signed, and validated in test receiver. |
| **14** | Payment Monitor & Observability | Auto-poll RPC for checkout payments + dashboard stats. | Pay on checkout, status updates automatically, and stats reflect in dashboard. |
| **15** | Mobile & E2E Hardening | Resiliency pass, mobile responsiveness, and timed demo run. | E2E Velo Pay flow runs on mobile and desktop without manual DB interventions. |

---

## 4. Sprint Details

### Sprint 9: Smart Contract Alpha
**Goal:** Implement and verify the second Soroban contract (`VeloPayAccess`) and cross-contract call logic.

**Scope:**
- Create `contracts/pay_access` directory structure (or implement alongside registry).
- Define `VeloPayAccess` contract functions:
  - `activate_payments(project_id)`
  - `deactivate_payments(project_id)`
  - `consume_checkout_credit(project_id, amount)`
  - `get_payment_access_status(project_id)`
  - `get_checkout_credits(project_id)`
- Implement inter-contract call: `VeloPayAccess` calls `VeloRegistry.get_project(project_id)` to verify the project is active.
- Require project owner auth using `require_auth` in `activate_payments`.
- Write Cargo integration tests covering:
  - Valid project activation (success).
  - Inactive/missing project activation (rejection).
  - Non-owner activation (rejection).
  - Credit consumption and status queries.
- Deploy contract to Stellar Testnet and document contract ID.

**Acceptance Criteria:**
- `cargo test` in pay_access passes.
- Inter-contract calls verify project status on-chain.
- Deployed Testnet ID recorded in environment files.

---

### Sprint 10: API Keys & Access Activation
**Goal:** Implement secure API key lifecycle and dashboard access activation hook.

**Scope:**
- Create `apiKeys` table in Convex schema:
  - `id`, `projectId`, `keyHash`, `prefix`, `label`, `createdAt`, `lastUsedAt`, `requestCount`, `revoked`.
- Replace existing single project API key queries/mutations with multi-key API.
- Secure API key storage: store only SHA-256 hash, display raw key once upon generation.
- Add "Revoke Key" mutation and UI action.
- Wire dashboard "Activate Velo Pay" button to trigger `VeloPayAccess.activate_payments` transaction.
- Create Convex background poll/sync for `VeloPayAccess` status.

**Acceptance Criteria:**
- Project owner can generate, label, and revoke multiple API keys.
- Hashing and display logic verified (raw key never stored).
- Dashboard locks/unlocks payment features based on on-chain payment access status.

---

### Sprint 11: PaymentIntents & Checkout Page
**Goal:** Build the payment intent model and the hosted customer-facing checkout page.

**Scope:**
- Create `paymentIntents` table in Convex schema.
- Implement `POST /api/v1/payment-intents` API endpoint (authenticated via API key).
- Build hosted payment route: `/pay/[paymentIntentId]`.
- Checkout UI displaying:
  - Merchant name & description.
  - Payment amount and accepted asset (e.g., Testnet USDC).
  - Stellar Wallets Kit connection (Freighter target).
  - "Pay Now" button triggering transfer transaction.
- Implement success and cancel landing paths: `/pay/[paymentIntentId]/success` and `/pay/[paymentIntentId]/cancel`.

**Acceptance Criteria:**
- API key request creates a `PaymentIntent` in state `created`.
- Customer can open `/pay/[paymentIntentId]`, connect wallet, and initiate the payment transaction.
- Payer wallet, amount, and receiver address are validated before transaction building.

---

### Sprint 12: Checkout SDK & Snippet Builder
**Goal:** Build integration helpers and dashboard copy-paste developer guides.

**Scope:**
- Package the API request wrapper into a lightweight Checkout helper (exported from `@repo/stellar` or a copyable JS/TS code block).
- Create dashboard "Integration" tab.
- Build interactive code snippet generator for Node.js/Next.js showing how to:
  - Initialize the checkout request.
  - Create a checkout session using API key.
  - Redirect the user to the returned `checkout_url`.
- Add test copy controls and instructions for local testing.

**Acceptance Criteria:**
- Developers can copy a functional code snippet from the dashboard.
- Snippet creates a new payment intent and returns the correct checkout URL.

---

### Sprint 13: Webhook Security & Signatures
**Goal:** Implement webhook secrets, payload signing, and delivery tracking.

**Scope:**
- Add webhook signing secret generation for each configured webhook endpoint.
- Implement HMAC-SHA256 signature generator for outgoing webhooks.
- Attach `x-velo-signature` and `x-velo-event` headers.
- Extend `webhookDeliveries` to log `payment_intent_id`, response times, and failure reasons.
- Write webhook payload verification utility helper in SDK for developers to parse and verify signatures on their end.
- Add support for new webhook event types: `payment.created`, `payment.succeeded`, `payment.failed`, `payment_access.activated`.

**Acceptance Criteria:**
- Webhook endpoints receive signed payloads.
- Verification utility successfully checks signature validity using the endpoint secret.
- Dashboard shows delivery logs, HTTP status, and payload signatures.

---

### Sprint 14: Payment Monitor & Observability
**Goal:** Build transaction verification, status sync, and dashboard analytics.

**Scope:**
- Implement RPC-based transaction confirmation scanner for submitted checkout transactions.
- Transition `PaymentIntent` status from `pending` -> `paid` or `failed` upon ledger confirmation.
- Increment merchant credit consumption on `VeloPayAccess` contract (optional demo tracking).
- Create basic statistics aggregation queries in Convex:
  - Total volume (USDC/assets processed).
  - Latency dashboard logs.
  - Webhook delivery success rates.
- Display metrics inside dashboard home.

**Acceptance Criteria:**
- Status transitions automatically from checkout submission to DB update.
- Successful payment fires `payment.succeeded` webhook automatically.
- Dashboard telemetry displays real-time payments count, amounts, and hook logs.

---

### Sprint 15: Mobile & E2E Hardening
**Goal:** Polish responsiveness, perform mobile wallet checks, and execute timed dry-run.

**Scope:**
- Responsive layout pass for checkout screen `/pay/[paymentIntentId]` and project dashboard tables.
- Mobile wallet adapter testing (Freighter Mobile or mock wallet flows).
- Handle edge cases: expired payment intents, insufficient balance, duplicate transaction submissions.
- Document step-by-step setup in `demo-setup.md`.
- Run complete E2E scenario (merchant registration -> checkout -> payment -> webhook confirmation).

**Acceptance Criteria:**
- E2E demo run-through completes within 5 minutes.
- All checkout interfaces display perfectly on mobile viewports.
- System handles connection dropouts and failed transaction submissions gracefully.

---

## 5. Cut Line (Prioritization Strategy)

If development time is squeezed, enforce this priority:

1. **Must Keep:**
   - `VeloPayAccess` contract + cross-contract query verification.
   - Project API key generation and hashing.
   - Payment intents schema and `/pay/[paymentIntentId]` hosted checkout page.
   - Webhook trigger on checkout submit.

2. **Can Defer or Simplify:**
   - Universal background RPC poller (can rely on checkout client submitting the hash to backend).
   - SDK as an NPM package (can remain a copy-paste code helper file in the project).
   - Webhook retries (single delivery attempt is sufficient for the demo).
   - Multi-asset checkout (limit demo to Testnet USDC only).
   - Detailed charts (replace with simple count cards).
