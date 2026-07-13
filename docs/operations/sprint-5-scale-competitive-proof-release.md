# Sprint 5: Scale, Competitive Proof, and Release

> **Sprint 9 status update — 2026-07-13:** Use the
> [Sprint 9 architecture](../architecture/sprint-9-real-lifecycle-benchmark-architecture.md),
> [operator runbook](./sprint-9-real-lifecycle-benchmark-runbook.md), and
> [evidence and closure record](../references/sprint-9-benchmark-evidence-and-closure.md)
> for the current seven-scenario, 84-cell qualification workflow. This Sprint 5 procedure and its
> earlier release-gate description are historical. No authorized Sprint 9 capture or P0.1 pass is
> recorded.

This runbook turns the speed plan's final sprint into a repeatable release decision. It does not create performance evidence by itself: a dry run validates the benchmark contract, while a real run must capture raw samples against an authorized environment.

The checked-in [`payment-intent-create.json`](../../benchmarks/reports/payment-intent-create.json) is marked `captured` but is **non-qualifying**: it is one local normal-profile run with 975 successes and 25 errors (2.5%), above the gate's 0.5% maximum. It is not an authorized baseline or a release claim.

## Evidence workflow

1. Pin the commit, Node/pnpm versions, region, network, dependency versions, payload, and concurrency in the benchmark environment.
2. Review the required matrix in [`benchmarks/profiles.json`](../../benchmarks/profiles.json).
3. Validate the checked-in scenarios:

   ```bash
   pnpm benchmark:smoke
   ```

   This validates configuration only. It does not create `final.json` or release evidence.

4. Capture each headline scenario during the `morning`, `afternoon`, and `evening` windows. Use the same wallet, asset, client region, runtime, confirmation definition, and authorized competitor conditions for every comparison. Store raw output under `benchmarks/reports/` and retain failed requests, timeouts, and distributions.
5. Run the release gate against a report that contains `runs`, and optionally a `baseline` keyed by scenario:

   ```bash
   node scripts/release-gate.mjs --report benchmarks/reports/final.json
   ```

   Equivalent package command:

   ```bash
   pnpm benchmark:gate -- --report benchmarks/reports/final.json
   ```

   Replace `benchmarks/reports/final.json` with an existing captured report path. `path/to/report.json` is only a placeholder. The HTTP scenarios can be captured with:

   ```bash
   mkdir -p benchmarks/reports
   node scripts/benchmark.mjs --scenario payment-intent-create --samples 1000 --concurrency 25 --out benchmarks/reports/payment-intent-create.json
   ```

   This command requires a live authorized Velo API. Browser, Stellar RPC, and lifecycle scenarios still require their declared fixtures; HTTP output alone cannot pass the full release gate.

   `benchmark:gate` does not generate evidence. If the report path is omitted, it uses `benchmarks/reports/final.json`; a missing report is an expected pre-capture failure. Set `VELO_BENCHMARK_REPORT` to use another default path.

The gate requires three captured runs, p95/p99 distributions, an error rate below 0.5%, and an explicitly explained growth-load p99 result. It rejects fixture output and missing distributions. A baseline comparison rejects p95 regressions above 5%.

`captured` means that a live adapter wrote output; it does not mean that the run qualifies. Dry-run outputs are `suite_validated`, `validated`, or `fixture_contract_validated`, while live non-HTTP scenarios without supplied fixtures are `fixture_capture_required`. None of these statuses can support a performance claim.

## Required report shape

Each captured scenario must include `status: "captured"`, `runId`, `profile`, `successfulSamples`, `errors`, `timeouts`, and `latencyMs.p50`, `latencyMs.p95`, and `latencyMs.p99`. Lifecycle scenarios must additionally retain stage timings for Velo-controlled time, wallet time, Stellar finality, confirmation observation, queue delay, and merchant endpoint time.

For a payment-intent-create 503, preserve the sample's correlation ID and count it as an error. The V2 route classifies the response as `anchor_unavailable`; the action currently maps PDAX lookup timeout, invalid response, and lookup failure to that code. The benchmark sample does not contain the response body, so downstream attribution requires correlated authorized logs. An HTTP 503 alone is not proof of a PDAX outage.

Competitor results are separate adapters. Do not merge incomparable semantics such as “request accepted” with “payment confirmed,” and do not publish a competitor result unless automated testing is authorized by its terms.

## Release decision

Release is approved only when:

- the release gate passes for three benchmark windows;
- growth-load p99 has no unexplained cliff and sustained error rate is below 0.5%;
- no critical journey regresses more than 5% at p95 without explicit approval;
- auth, idempotency, payment-state transitions, signing, event recovery, webhook durability/signing/replay, and SDK transport tests pass;
- dashboards, alerts, feature flags, rollback steps, and incident ownership are verified;
- Product and Architecture approve every external performance claim against the raw distributions and feature-difference notes.

Until those conditions are met, performance language remains internal and must say “benchmark in progress” rather than “faster.”

## Incident and rollback runbook

1. Disable the affected optimization with its feature flag, preserving idempotency and durable recovery paths.
2. If a dependency is degraded, reduce worker concurrency and allow bounded backoff; never remove deadlines or blindly resubmit an unknown transaction.
3. Preserve the correlation ID, raw trace, queue depth, cursor position, delivery ID, and release revision.
4. Reconcile pending transactions and event cursors before replaying webhook deliveries. Replay only from durable delivery records.
5. Re-run the focused regression and the affected benchmark profile before re-enabling the flag.

Escalate immediately for duplicate payment side effects, lost cursor checkpoints, unauthorized data exposure, signing failures, or unexplained p99 cliffs.

## Public-safe claim checklist

- [ ] Claim names the exact journey and confirmation definition.
- [ ] p50/p95/p99, sample size, windows, errors, and timeouts are available.
- [ ] Environment, region, revision, runtime, network, and dependency versions are disclosed.
- [ ] Velo-controlled, wallet, Stellar, queue, and merchant endpoint time are separated.
- [ ] Competitor feature differences and uncertainty are stated.
- [ ] Terms-compliant test authorization is recorded.
- [ ] Product and Architecture approved the final wording.
