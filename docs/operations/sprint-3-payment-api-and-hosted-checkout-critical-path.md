# Sprint 3: Payment API and Hosted Checkout Critical Path

This guide documents the Sprint 3 implementation. Its synchronous PDAX creation design was superseded by [Sprint 7 critical-path containment](../architecture/sprint-7-p0.5-critical-path-containment.md), which atomically creates `awaiting_route` intents and performs provider work through durable scheduled enrichment.

## Architectural Overview

We have reduced client-to-backend round trips during the checkout submission flow and combined intent-creation checkpoints to achieve near-instantaneous state transition and lower plataforma-added latency.

The current creation sequence is documented in the Sprint 7 guide linked above. In summary, the API invokes one Convex mutation. In-house intents become `created` immediately; PDAX intents and their durable route job are committed atomically as `awaiting_route`, then a scheduled worker resolves the address before moving the intent to `created`.

---

## 1. Payment-Intent API Critical Path Optimizations

The current implementation keeps creation inside one transaction boundary:

1. Authorization, project scope, anchor selection, idempotency, intent creation, and route-job creation are resolved atomically.
2. PDAX network I/O is excluded from the request path. A durable worker uses a shared cache, per-provider coalescing lease, bounded retries, and a circuit breaker.
3. The worker and PDAX client use bounded deadlines. A lease-expiry watchdog can reclaim work after a crashed worker.
4. Idempotency outcomes remain typed (`idempotency_replay` or `idempotency_conflict`) and concurrent same-key requests produce one intent and one route job.

---

## 2. Hosted Checkout Latency Reduction

We redesigned the payment submission flow in `checkout-client.tsx` to be faster and less prone to transaction timeouts:
1. **Parallelized Horizon Reads:**
   - Payer and receiver account checks in the Stellar SDK's `buildCheckoutPaymentTransaction` now run concurrently via `Promise.all`, cutting Horizon account load latency in half.
2. **Elimination of Pre-Submit Round Trip:**
   - The client no longer calls Convex to update the intent status to `pending` before sending the transaction to Stellar.
   - Instead, the client signs and submits the transaction to Horizon immediately.
3. **Combined Post-Submit Mutation:**
   - Upon successful submission (or non-terminal submission failure), the client makes a single call to `reportSubmitted`.
   - This mutation records the submitted transaction record in the `transactions` table, transitions the payment intent status to `pending`, and starts the fast-path watcher.

---

## 3. Stage-level Telemetry and Timing

To support the Platform's p95 latency tracing dashboard, we introduced explicit stage timestamps.
1. **Payer Interaction Tracking:**
   - The checkout client measures local Unix timestamps for:
     - `startedSigningAt` (when the Freighter/wallet standard popup is launched).
     - `signedAt` (when the signature is received).
     - `submittedAt` (when submission to Horizon is initiated).
2. **Unified Schema:**
   - We added a `stageTimestamps` object to the `paymentIntents` schema:
     ```typescript
     stageTimestamps: v.optional(
       v.object({
         created: v.number(),
         awaiting_signature: v.optional(v.number()),
         signed: v.optional(v.number()),
         submitted: v.optional(v.number()),
         confirmed: v.optional(v.number()),
         failed: v.optional(v.number()),
         cancelled: v.optional(v.number()),
         expired: v.optional(v.number()),
       })
     )
     ```
3. **API Exposure:**
   - The public V2 payment intent models and Next.js route payloads parse and expose `stageTimestamps` in ISO string format (e.g. `2026-07-11T06:15:30.000Z`) so integrators and monitoring dashboards can query the exact time spent in each phase.
