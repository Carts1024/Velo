# Velo Convex Backend Operating Notes

## Sprint 8 reliability services

Financial provider calls are owned by `providerOperations`; payment RPC uncertainty is owned by
`paymentReconciliationJobs`; inbound PDAX callbacks are persisted in `providerEvents`; outbound
merchant notifications use immutable `webhookDomainEvents` plus fenced `webhookDeliveries`.
Together these provide **exactly-once observable transitions**, not exactly-once transport.

Provider and payment workers use indexed pages of at most 100 and continuation scheduling. The
capacity contract is covered by [`10,000 reconciliation jobs drain in exactly 100 bounded pages`](durableReliability.test.ts). Provider lease fencing is covered by [`lease fencing rejects stale completion and ambiguous trades cannot resubmit`](durableReliability.test.ts).

Public payment REST routes call `rate_limits.mutations.consume` once before create/get/list and use
its result for rate-limit headers. Shared enforcement is covered by [`distributed rate limits are shared by concurrent callers`](durableReliability.test.ts).

## Configuration and rollout

Required Convex environment variables:

- `PDAX_UAT_BASE_URL`, `PDAX_UAT_USERNAME`, and `PDAX_UAT_PASSWORD`
- `PDAX_CALLBACK_URL` and `PDAX_WEBHOOK_TOKEN`
- `STELLAR_RPC_URL`

The direct provider ingress is `POST /api/webhooks/pdax/v1?token=…`; the retired Next.js route
returns 410. After additive schema deployment, run `internal.sprint8_migrations.backfill` and
re-register active PDAX projects with `settlement.actions.registerWebhook({ projectId })`.

Use authenticated provider-operation queries and `provider_operations.mutations.redrive` for
operator recovery. Redrive preserves the original request fingerprint/provider UUID; an ambiguous
trade must not become a new submission. This invariant is covered by [`lease fencing rejects stale completion and ambiguous trades cannot resubmit`](durableReliability.test.ts).

## Webhook delivery

Canonical payment and settlement mutations enqueue `internal.webhookDelivery.trigger` after the
transaction commits. Immutable domain events deduplicate deliveries per endpoint/schema version,
and lease token/generation fencing rejects stale workers. This is covered by [`duplicate delivery triggers share one fenced delivery`](durableReliability.test.ts).

Network failures, HTTP 408/429, and 5xx responses retry at most five times with bounded jitter and
`Retry-After` support. Terminal retryable failure sets `deadLetter: true`; authenticated replay
reuses the durable record. Evidence: [`webhook delivery retry and backoff lifecycle`](webhookDelivery.test.ts) and [`webhook retry scheduling honors Retry-After for retryable endpoint failures`](webhookDelivery.test.ts).

The dispatcher uses an 8-second total deadline and a conservative 2-second setup abort. Queue
timing is stored in `nextAttemptAt`/`lastAttemptAt`; endpoint latency is stored in
`responseTimeMs`.

See the [Sprint 8 runbook](../../../docs/operations/sprint-8-durable-financial-reliability-runbook.md).

Sprint 8 has no live SLO qualification and no production availability evidence.
