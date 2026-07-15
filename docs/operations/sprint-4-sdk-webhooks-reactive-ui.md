# Sprint 4: SDK Transport, Webhooks, and Reactive UI

This guide documents the Sprint 4 implementation currently in the worktree for the [speed plan](../plans/velo-speed-sprint-plan.md#sprint-4--sdk-webhooks-and-reactive-ui). It is an operations note, not evidence that the Sprint 4 SLOs are met.

## Current status

Sprint 4 is partially implemented.

- SDK requests now have a total deadline, retry budget, `AbortSignal` support, `Retry-After` handling, correlation headers, and typed timeout/rate-limit/provider/submission-unknown errors.
- Webhook delivery now uses durable delivery records with stable delivery/event IDs across retries, bounded outbound deadlines, retry-after-aware scheduling, dead-letter metadata, and owner-triggered replay.
- Checkout and merchant webhook screens already use Convex `useQuery` subscriptions, so they react to canonical backend writes without browser polling. Sprint 4 adds browser offline notices and reconnection copy.

Do not claim SDK overhead, webhook first-attempt/acknowledgement latency, or UI render p95 from this implementation alone. No checked-in Sprint 4 benchmark report or load-test output is present.

## SDK transport behavior

The SDK transport lives in [`packages/velo-sdk/src/http.ts`](../../packages/velo-sdk/src/http.ts) and is surfaced through `RequestOptions` in [`packages/velo-sdk/src/types.ts`](../../packages/velo-sdk/src/types.ts).

Defaults:

| Setting | Default | Scope |
| --- | ---: | --- |
| `timeoutMs` | 30,000 ms | Total wall-clock budget for one SDK request, including retries |
| `maxRetries` | 2 | Retry attempts after the first attempt |
| `retryBaseDelayMs` | 250 ms | Initial exponential-backoff base |
| `retryMaxDelayMs` | 2,000 ms | Cap before jitter |

Per-request options can override `timeoutMs` and `maxRetries`. `RequestOptions.signal` cancels waits and fetches. When the caller aborts, the current implementation preserves the caller's `AbortSignal.reason`; cancellation is not always wrapped in `VeloRequestCancelledError`.

Retry policy:

- Safe reads are retryable: `GET`, `HEAD`, and `DELETE`.
- `PUT` is retried only with an `idempotencyKey`.
- `POST` is retried only with an `idempotencyKey` and only when `submission` is not set.
- Creation calls without an idempotency key are not retried.
- Retryable failures are SDK rate-limit errors, HTTP 408/425/500/502/503/504 mapped errors, and network errors detected from `fetch`.
- `Retry-After` may be either seconds or an HTTP date and is honored inside the remaining total request deadline.
- Retry delays use capped jitter when no `Retry-After` value is available.

Headers:

- `Authorization: Bearer <apiKey>` is sent on every request.
- `Idempotency-Key` is sent when `options.idempotencyKey` is present.
- `X-Correlation-Id` is sent when `options.correlationId` is present.

Typed errors added or extended in this sprint:

- `VeloTimeoutError` for SDK total-deadline expiry. It extends `VeloAPIError` and uses status `408` and code `timeout`.
- `VeloProviderError` for 502/503/504 responses or API payloads typed as provider errors.
- `VeloSubmissionUnknownError` for transaction-submission requests marked `{ submission: true }` when the network outcome is unknown. Callers must reconcile by transaction hash rather than blindly resubmit.
- `VeloRateLimitError` can carry `retryAfterMs` through the shared `VeloError` base.

Runtime behavior:

- The SDK uses the runtime's global `fetch`.
- Node 18+, serverless, edge, and browsers have different connection-pooling behavior. The SDK does not install a Node-specific HTTP agent or force connection reuse.
- The SDK remains documented as server-side only because it uses API keys and webhook secrets. Browser wallet/payment UI is outside the alpha SDK package.

### SDK migration notes

Existing callers can keep their current initialization, but should explicitly choose transport budgets:

```ts
const velo = new Velo({
  apiKey: process.env.VELO_API_KEY!,
  environment: "testnet",
  timeoutMs: 10_000,
  maxRetries: 2,
});
```

For write calls, pass a stable idempotency key before depending on SDK retry behavior:

```ts
await velo.checkout.sessions.create(
  {
    amount: "10.00",
    asset: "USDC",
    description: "Order #1001",
  },
  {
    idempotencyKey: "order-1001",
    correlationId: "order-1001-checkout",
  },
);
```

For reads, pass an `AbortSignal` if the surrounding request lifecycle can end earlier than the SDK deadline. Handle `VeloTimeoutError`, `VeloRateLimitError`, `VeloProviderError`, and caller abort reasons separately in operators and API adapters.

## Webhook delivery behavior

Webhook delivery is implemented in [`packages/backend/convex/webhookDelivery.ts`](../../packages/backend/convex/webhookDelivery.ts), with delivery state in [`packages/backend/convex/webhook_deliveries/schema.ts`](../../packages/backend/convex/webhook_deliveries/schema.ts) and replay in [`packages/backend/convex/webhook_deliveries/mutation.ts`](../../packages/backend/convex/webhook_deliveries/mutation.ts).

### Delivery IDs, event IDs, and at-least-once semantics

- Each first attempt creates a durable `webhookDeliveries` record.
- `x-velo-delivery` is the delivery record ID. Consumers should deduplicate using this value.
- The payload `id` is generated on the first attempt and saved in `payloadSummary.id`.
- Retry and replay attempts reuse the original payload `id`, so consumers see a stable event ID for the same durable delivery.
- Delivery remains at-least-once. A merchant endpoint can receive duplicates after retries or replay.

### Deadlines

Outbound webhook fetches use the same abort controller for two guards:

- setup/connect guard: 2,000 ms;
- total guard: 8,000 ms.

The portable `fetch` API does not expose a true TCP/TLS connect phase. In this implementation the 2-second setup guard aborts the shared request controller if it fires first, so it is a conservative response-start guard rather than a wire-level connect measurement. `responseTimeMs` records endpoint network time for the attempt.

### Retry and dead letter

Retryable failures are:

- network or deadline errors;
- HTTP 408;
- HTTP 429;
- HTTP 5xx.

Non-retryable HTTP failures finish as `failed` without `deadLetter: true`. Retryable failures retry up to five total attempts. Backoff uses jittered delays capped at 900 seconds and honors `Retry-After` values, also capped at 900 seconds. The current base delay table is `[0, 15, 60, 300, 900]`, and the first normal retry from an initial attempt uses the 15-second slot because `attemptCount` starts at 1.

When retryable failures are exhausted, the delivery keeps status `failed` for compatibility and adds:

- `deadLetter: true`;
- `deadLetterAt`;
- the latest `errorMessage`, `httpStatus`, `lastAttemptAt`, and `responseTimeMs`.

`nextAttemptAt` is stored while a retry is pending, which lets operators distinguish queue delay from endpoint response time by comparing `nextAttemptAt`, `lastAttemptAt`, and `responseTimeMs`.

### Replay

Authenticated project owners can replay a delivery through `webhook_deliveries.mutation.replay`. Replay:

- authorizes against the delivery's project owner;
- patches the same delivery record back to `pending`;
- clears `deadLetter`;
- sets `replayedAt` and `nextAttemptAt`;
- schedules `internal.webhookDelivery.trigger` immediately;
- reuses the same delivery ID and saved event ID.

There is no visible replay button in the changed merchant UI yet.

## Reactive UI delivery behavior

The hosted checkout page uses:

- `useQuery(api.payment_intents.queries.getPaymentIntent, { paymentIntentId })`, a direct ID lookup for the payment intent;
- `useMutation(api.transactions.mutation.reportSubmitted)` after Stellar submission;
- route redirects when the subscribed intent becomes `paid`, `failed`, or `cancelled`.

The merchant webhook page uses narrow owner-scoped Convex subscriptions:

- `webhook_endpoints.query.getSettings`;
- `webhook_deliveries.query.listByProject` with the `by_project_created_at` index and a limit of 50;
- `contract_events.query.listByProject` with a limit of 1 for the latest observed activity.

Convex subscriptions are reactive: when the backend commits an authoritative state change, subscribed clients receive updated query results without manual refresh or browser polling.

Sprint 4 adds browser `online`/`offline` indicators to checkout and webhook screens. These indicators only reflect the browser's network status. They are not the same as backend subscription health, Convex websocket health, worker health, or webhook queue health. A browser may report online while a backend subscription is delayed, and it may report offline while already-rendered data remains visible. Treat the notice as payer/operator guidance, not as an SLO measurement.

## Configuration and defaults

| Area | Default/current value | Source |
| --- | ---: | --- |
| SDK total timeout | 30,000 ms | `DEFAULT_TIMEOUT_MS` |
| SDK max retries | 2 | `DEFAULT_MAX_RETRIES` |
| SDK retry base/max | 250 ms / 2,000 ms | `DEFAULT_RETRY_BASE_MS`, `DEFAULT_RETRY_MAX_MS` |
| SDK production base URL | `https://api.velo.pay` | `resolveBaseUrl` |
| SDK testnet base URL | `https://api.testnet.velo.pay` | `resolveBaseUrl` |
| SDK development base URL | `http://localhost:3000` | `resolveBaseUrl` fallback |
| Webhook setup/connect guard | 2,000 ms | `WEBHOOK_CONNECT_TIMEOUT_MS` |
| Webhook total guard | 8,000 ms | `WEBHOOK_TOTAL_TIMEOUT_MS` |
| Webhook max attempts | 5 | `MAX_WEBHOOK_ATTEMPTS` |
| Webhook max retry delay | 900 s | `MAX_RETRY_DELAY_SECONDS` |
| Webhook dashboard delivery limit | 50 latest deliveries | `ProjectWebhooks` query args |

## Tests and verification

Relevant tests in the current worktree:

- [`packages/velo-sdk/src/client.test.ts`](../../packages/velo-sdk/src/client.test.ts): SDK timeout typing, caller abort preservation, provider error mapping, correlation header, `Retry-After`, idempotent retry, and submission-unknown behavior.
- [`packages/velo-sdk/src/webhooks.test.ts`](../../packages/velo-sdk/src/webhooks.test.ts): webhook signature verification.
- [`packages/backend/convex/tests/webhookDelivery.test.ts`](../../packages/backend/convex/tests/webhookDelivery.test.ts): webhook retry lifecycle, dead-letter marking, `Retry-After`, and correlation ID preservation.

Suggested focused verification:

```bash
pnpm --filter @carts1024/velo-sdk test
pnpm --filter @repo/backend test
pnpm --filter web test
```

These commands verify functional behavior. They do not produce the SDK overhead, webhook queue/acknowledgement, or UI render benchmark report required by the Sprint 4 plan.

## Explicit gaps versus Sprint 4 acceptance criteria

| Sprint 4 criterion | Current evidence | Gap |
| --- | --- | --- |
| No SDK or webhook request hangs indefinitely | SDK total deadline exists. Webhook outbound fetches have bounded abort guards. | Webhook preparation queries and scheduler execution are not measured as a full end-to-end deadline. |
| SDK overhead meets locked p95 target | No SDK overhead benchmark report is checked in. | Need measured raw results against the locked p95 target. |
| Healthy endpoint meets first-attempt and acknowledgement targets | Delivery attempts start after scheduler enqueue and record response time. | No checked-in first-attempt or acknowledgement latency benchmark. |
| Slow merchant does not delay unrelated merchants | Retries are per delivery and retry scheduling is durable. | No explicit global/per-destination concurrency control, circuit breaker, or slow-endpoint isolation load test is present. |
| UI updates without manual refresh and meets locked p95 | Checkout and webhook views use Convex reactive subscriptions. | No backend-write-to-render measurement or p95 report is present. |
| Reconnect restores authoritative state | Convex subscriptions reconcile after reconnect, and browser offline copy tells users to wait for authoritative state. | No subscription reconnect test or backend subscription-health indicator is present. Browser offline status is not backend subscription health. |
| Signing, durability, idempotency, and compatibility remain intact | Webhook signatures, durable records, stable IDs, and retry/dead-letter tests are present. SDK idempotent retry tests are present. | Replay compatibility and duplicate delivery behavior still need broader regression/load evidence. |
