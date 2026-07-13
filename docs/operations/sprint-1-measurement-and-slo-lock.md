# Sprint 1: Measurement, Baseline, and SLO Lock

> **Sprint 9 status update — 2026-07-13:** This Sprint 1 runbook is retained as
> historical context. The current benchmark contract is documented in the
> [Sprint 9 architecture](../architecture/sprint-9-real-lifecycle-benchmark-architecture.md),
> [operator runbook](./sprint-9-real-lifecycle-benchmark-runbook.md), and
> [evidence and closure record](../references/sprint-9-benchmark-evidence-and-closure.md).
> Runner and qualification-gate engineering now cover seven executable client adapter contracts,
> but the five control scenarios still require an operator-supplied, conforming staging controller.
> Live capture and P0.1 qualification remain pending.

This is the operator guide for the measurement artifacts added for Sprint 1 of the [speed plan](../plans/velo-speed-sprint-plan.md#sprint-1--measurement-baseline-and-slo-lock).

## Current status

**No live, authorized baseline has been captured. Do not make a latency, throughput, availability, or competitive-speed claim from this repository.** [`benchmarks/baselines/sprint-1-pending.json`](../../benchmarks/baselines/sprint-1-pending.json) deliberately records `pending_live_capture` and contains no measurements. A checked-in report is present, but it is a single local `captured` run with a 2.5% error rate and is therefore non-qualifying; it is not a baseline. The benchmark runner is checked in and its smoke validation runs in CI, but fixture scenarios do not yet capture latency until their declared fixtures are supplied.

The provisional targets in the [speed plan](../plans/velo-speed-sprint-plan.md#4-provisional-slos) remain proposed until the evidence gate below is met. A target that cannot be met must be revised to a documented baseline-relative gate, not presented as an achieved SLO.

## Correlation and lifecycle tracing

Correlation IDs are opaque identifiers, not wallet or credential data. An HTTP route accepts `X-Correlation-Id` only when it matches the safe 8--128-character pattern; otherwise it creates a UUID. The ID is returned as `X-Correlation-Id` on every completed V1/V2 payment-intent route response.

```mermaid
sequenceDiagram
  participant SDK as SDK caller
  participant API as V1 or V2 API route
  participant Convex as Convex intent and delivery records
  participant Webhook as Merchant webhook

  SDK->>API: X-Correlation-Id (optional)
  API->>API: validate or generate ID; record route timings
  API->>Convex: create action/mutation with correlationId
  Convex->>Convex: paymentIntent.correlationId; schedule event
  Convex->>Webhook: x-correlation-id header + correlationId payload field
  Webhook-->>Convex: delivery result linked by correlationId
  API-->>SDK: X-Correlation-Id + Server-Timing
```

- The SDK helper [`createCheckoutSession`](../../packages/stellar/src/checkout.ts) accepts `correlationId` and sends it to `POST /api/v2/payment-intents`.
- Both [`V1`](../../apps/web/app/api/v1/payment-intents/route.ts) and [`V2`](../../apps/web/app/api/v2/payment-intents/route.ts) create route telemetry, pass its ID into the Convex action, and return the response headers.
- The V2 action forwards the ID into the payment-intent mutation; [`paymentIntents`](../../packages/backend/convex/payment_intents/schema.ts) stores it and indexes it by project. The payment-created/failed/succeeded scheduling paths pass it to webhook work.
- [`webhookDeliveries`](../../packages/backend/convex/webhook_deliveries/schema.ts) stores and indexes the same ID. [`webhookDelivery`](../../packages/backend/convex/webhookDelivery.ts) emits it in `x-correlation-id` and, when set, in the webhook JSON `correlationId` field.

This is the currently implemented request-to-intent-to-webhook boundary. The source tree does not yet add the correlation ID to every Stellar RPC/Horizon or provider call, and it does not configure an OpenTelemetry exporter or trace dashboard. Treat those as remaining Sprint-1 plan work, not as implemented instrumentation.

### Operator lookup

An authenticated project owner can reconstruct the persisted part of a payment lifecycle with the public Convex query [`getProjectPaymentLifecycleByCorrelation`](../../packages/backend/convex/payment_intents/queries.ts). Authorization occurs before the two project-scoped indexed reads; a non-owner receives `null`, and an unauthenticated caller is rejected.

```bash
# Read-only operator diagnostic. The identity must match the project's owner.
pnpm --filter @repo/backend exec convex run \
  --identity '{"subject":"<owner-stellar-address>","tokenIdentifier":"<owner-token-identifier>"}' \
  payment_intents/queries:getProjectPaymentLifecycleByCorrelation \
  '{"projectId":"<convex-project-id>","correlationId":"<x-correlation-id>"}'
```

The result contains `paymentIntents`, `webhookDeliveries`, and a time-ordered `stages` projection. For a project already bound to an owner token, `tokenIdentifier` must match it; otherwise the subject must normalize to the project's owner Stellar address. Its timestamps are `payment_intent.created`, the current `payment_intent.<status>`, `webhook.queued`, and `webhook.<status>`. It is intentionally not evidence of browser-render time, Stellar submission time, or ledger inclusion time: those timestamps are not persisted by this implementation.

## Response telemetry and redaction

[`apps/web/core/observability.ts`](../../apps/web/core/observability.ts) supplies the route telemetry primitive:

- `Server-Timing` always includes `velo_total`; recorded stage names are normalized, capped at 48 characters, and only the first 12 are exposed. The V1/V2 routes currently record `convex.action` for creates and `convex.query` for lists.
- `X-Correlation-Id` and `Server-Timing` are added to successful and handled error responses through `completeRequestTelemetry`.
- `emitTelemetry` logs a redacted structured event. Recursive redaction masks fields whose names indicate authorization, API keys, secrets, signatures, tokens, passwords, private keys, XDR, payloads, wallet seeds, mnemonics, or passphrases. It does not log a request body through the route helper.

Do not add raw API keys, signed XDR, webhook signing secrets, request/response payloads, or wallet-private material to telemetry. The tests in [`telemetry.test.ts`](../../apps/web/features/observability/telemetry.test.ts) cover accepted/rejected correlation IDs, headers, and redaction. [`telemetry-overhead.test.ts`](../../apps/web/features/observability/telemetry-overhead.test.ts) only verifies that a local comparison can run; it reports no overhead percentage and cannot establish the plan's 3% gate.

## Benchmark harness

The scenario registry is [`benchmarks/scenarios.json`](../../benchmarks/scenarios.json) and the runner is [`scripts/benchmark.mjs`](../../scripts/benchmark.mjs).

```bash
# Validate every scenario contract; no network calls and no measurements.
pnpm benchmark:smoke

# Capture an authorized HTTP intent-creation run (defaults: 1,000 samples, 25 concurrency, 10 s deadline).
VELO_BENCHMARK_BASE_URL=https://<velo-origin> \
VELO_BENCHMARK_API_KEY=<authorized-benchmark-key> \
VELO_BENCHMARK_REGION=<client-region> \
VELO_BENCHMARK_NETWORK=<stellar-network> \
VELO_BENCHMARK_DEPENDENCY_VERSIONS=<pinned-dependencies> \
VELO_BENCHMARK_PROFILE=normal \
node scripts/benchmark.mjs --scenario payment-intent-create --samples 1000 --concurrency 25 \
  --out benchmarks/results/<utc-timestamp>-payment-intent-create.json

# Validate, rather than capture, all seven scenarios.
node scripts/benchmark.mjs --dry-run --suite
```

HTTP scenarios are `payment-intent-create` and `payment-intent-list`. The registry also declares fixture contracts for checkout preparation, transaction submission, confirmation detection, UI propagation, and webhook delivery. Non-HTTP adapters return `fixture_capture_required` (or `fixture_contract_validated` in dry-run), an empty `samples` array, and **must never be included in a speed claim** until their fixture contract is implemented and supplied. Suite dry-run output is `suite_validated`; HTTP scenario dry-run output is `validated`. These statuses validate contracts only; `captured` means live output exists and still requires authorization and quality-gate review.

Each HTTP request receives a unique `x-correlation-id`, an idempotency key where configured, and an `AbortSignal` deadline. The deadline is `--timeout-ms`, then `VELO_BENCHMARK_TIMEOUT_MS`, then 10,000 ms. A deadline expiry produces a sample with `status: 0` and `timeout: true`; it is counted as an error and excluded from latency percentiles. For payment-intent creation, HTTP 503 `anchor_unavailable` is an API classification for unavailable anchor lookup; correlate the sample's ID with logs before attributing it to a specific PDAX cause.

### Result schema

For an HTTP capture the JSON output includes:

- run metadata: `scenario`, `journey`, `revision`, `capturedAt`, `region`, `runtime`, `network`, `dependencyVersions`, `sampleSize`, `concurrency`, `timeoutMs`, `profile`, and `runId`;
- aggregates: `successfulSamples`, `errors`, `timeouts`, `wallDurationMs`, `throughputPerSecond`, and `latencyMs.p50|p95|p99` calculated from successful HTTP responses only; and
- one `samples` entry per request with `sample`, `durationMs`, `status`, `timeout`, and, on successful fetches, the echoed `correlationId` (or an error name on failures).

`--out` writes the raw JSON exactly as produced. Set `GITHUB_SHA` or `VELO_BENCHMARK_REVISION` so `revision` is not `unresolved`. The required result naming convention is defined in the pending baseline artifact: `benchmarks/results/<utc-timestamp>-<scenario>.json`.

## Evidence required to lock or revise SLOs

Locking needs all of the following, not merely a successful smoke run:

1. Raw JSON from three distinct time windows, with at least 1,000 **successful** samples per headline scenario in each required run.
2. Separate captures for `idle`, `normal`, `growth`, `cold-start`, and `degraded-dependency`, with the scenario's declared fixture available for every non-HTTP journey.
3. Every run pins the revision, capture date, client region, runtime, Stellar network, dependency versions, payload, sample size, and concurrency. Record topology between client, web runtime, Convex, Stellar RPC, and PDAX beside the results.
4. The report preserves p50/p95/p99, throughput, errors, timeouts, cold-start/dependency timing where the fixture captures them, queue depth, and event lag. It identifies the three largest Velo-controlled contributors and notes feature differences for any comparison.
5. A telemetry-enabled versus telemetry-disabled measurement demonstrates that instrumentation meets the 3% p95 overhead gate. The current test is not this evidence.
6. An approved SLO sheet links the raw files, states the exact confirmation definition, and either locks each provisional target or records the baseline-relative replacement and reason. It must not make a like-for-like or competitor claim without authorized, comparable raw evidence.

Until that packet exists, the only valid status is the pending-live-capture status above.

## Verification references

Run the focused checks after documentation or harness changes:

```bash
pnpm benchmark:smoke
pnpm --filter @repo/backend test
pnpm --filter web test
```

The CI workflow runs the smoke command in [`ci.yml`](../../.github/workflows/ci.yml). Correlation propagation, authorization, and webhook payload/header behavior are covered in [`paymentIntent.test.ts`](../../packages/backend/convex/paymentIntent.test.ts) and [`webhookDelivery.test.ts`](../../packages/backend/convex/webhookDelivery.test.ts).
