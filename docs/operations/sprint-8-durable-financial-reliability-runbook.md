# Sprint 8 Durable Financial Reliability Runbook

## Reliability boundary

This runbook operates **exactly-once observable transitions**, not exactly-once transport. Its
evidence is deterministic and automated; Sprint 8 has no live SLO qualification and no production
availability evidence.

## Required configuration

Configure these server-only variables in the Convex deployment:

```bash
PDAX_UAT_BASE_URL="https://uat.services.sandbox.pdax.ph/api/pdax-api"
PDAX_UAT_USERNAME="<uat-user>"
PDAX_UAT_PASSWORD="<uat-password>"
PDAX_CALLBACK_URL="https://<deployment>.convex.site"
PDAX_WEBHOOK_TOKEN="<high-entropy-secret>"
STELLAR_RPC_URL="https://soroban-testnet.stellar.org"
```

`registerWebhook({ projectId })` constructs
`${PDAX_CALLBACK_URL}/api/webhooks/pdax/v1?token=${PDAX_WEBHOOK_TOKEN}` server-side and registers it
for fiat and crypto callbacks. Never accept a callback URL from the browser. The retired Next.js
`POST /api/webhooks/pdax` route returns `410 Gone`; re-register every active PDAX connection before
depending on the new ingress. Strict callback shape behavior is covered by
[`rejects malformed and stale webhook shapes`](../../packages/pdax/src/client.test.ts).

## Deployment and migration

1. Deploy the additive Convex schema and functions; do not edit `_generated` files manually.
2. Set the environment variables above.
3. Run `internal.sprint8_migrations.backfill` with null cursors. It processes at most 100 pending
   payments, 100 pending payouts, and 100 provider events per invocation and schedules its
   continuation.
4. Confirm pending payments have reconciliation jobs and legacy unprocessed provider events are
   quarantined as `legacy_event_requires_review`. Confirm legacy pending payouts with stable
   identifiers are `provider_pending`; records without one are visible `dead_letter` recovery
   items.
5. Re-register each PDAX project using `settlement.actions.registerWebhook({ projectId })`.
6. Verify the old Next route returns 410 and the Convex route rejects missing tokens.

The bounded-page invariant is covered by
[`10,000 reconciliation jobs drain in exactly 100 bounded pages`](../../packages/backend/convex/durableReliability.test.ts).

## Triage and recovery

| Symptom                               | Inspect                                                       | Action                                                                            |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Settlement returns `in_progress`      | `providerOperations.state`, lease generation, `nextAttemptAt` | Wait for reconciliation; retain the original client key.                          |
| Trade is `reconciling`                | Error and provider reference                                  | Do not resubmit. Obtain operator/provider corroboration.                          |
| Withdrawal remains `provider_pending` | Provider UUID and `providerPendingExpiresAt`                  | Verify PDAX lookup health; the worker polls by the persisted UUID.                |
| Operation is `dead_letter`            | Attempts, expiry, sanitized error                             | Resolve the cause, then call authenticated `redrive`; redrive preserves identity. |
| Payment job is `dead_letter`          | Transaction hash and RPC errors                               | Verify the hash/RPC independently before manual recovery.                         |
| Provider event is `quarantined`       | `quarantineReason`, identifier, payload digest                | Match it to the correct project/operation and corroborate with PDAX.              |
| Merchant delivery is dead-lettered    | HTTP status, attempts, endpoint                               | Fix endpoint/signing configuration, then use the authenticated replay mutation.   |
| REST route returns 429                | Rate-limit headers                                            | Honor `Retry-After`; do not bypass the Convex token bucket.                       |

Trade no-resubmission and stale-lease protection are covered by
[`lease fencing rejects stale completion and ambiguous trades cannot resubmit`](../../packages/backend/convex/durableReliability.test.ts). Delivery replay/backoff is covered by
[`webhook delivery retry and backoff lifecycle`](../../packages/backend/convex/webhookDelivery.test.ts).

## Evidence commands

```bash
pnpm --filter @repo/backend test
pnpm --filter @repo/pdax test
pnpm --filter @carts1024/velo-sdk test
pnpm --filter @repo/backend exec oxlint convex
pnpm --filter @repo/backend exec tsc -p convex/tsconfig.json --noEmit
```

Acceptance evidence names:

- Reservation/idempotency: [`100 concurrent %s reservations produce one operation and one submission claim`](../../packages/backend/convex/durableReliability.test.ts) (Vitest expands `%s` for trade and fiat withdrawal)
- Lease fencing/no trade resubmit: [`lease fencing rejects stale completion and ambiguous trades cannot resubmit`](../../packages/backend/convex/durableReliability.test.ts)
- Distributed limiter: [`distributed rate limits are shared by concurrent callers`](../../packages/backend/convex/durableReliability.test.ts)
- Delivery identity/fencing: [`duplicate delivery triggers share one fenced delivery`](../../packages/backend/convex/durableReliability.test.ts)
- Backlog capacity: [`10,000 reconciliation jobs drain in exactly 100 bounded pages`](../../packages/backend/convex/durableReliability.test.ts)
- PDAX strict parsing: [`rejects malformed and stale webhook shapes`](../../packages/pdax/src/client.test.ts)
- SDK version/signature ordering: [`verifyWebhookSignature verifies HMAC before rejecting unsupported versions`](../../packages/velo-sdk/src/webhooks.test.ts)

Record command output, commit SHA, runtime versions, and deployment name with release evidence. Do not
promote deterministic test results as observed production availability.
