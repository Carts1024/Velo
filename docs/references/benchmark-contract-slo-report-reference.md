# Benchmark Contract, SLO, and Report Reference

> **Sprint 9 status update — 2026-07-13:** The current contract and evidence disposition are in the
> [Sprint 9 architecture](../architecture/sprint-9-real-lifecycle-benchmark-architecture.md),
> [operator runbook](../operations/sprint-9-real-lifecycle-benchmark-runbook.md), and
> [evidence and closure record](./sprint-9-benchmark-evidence-and-closure.md). The Sprint 6 fixture
> statuses and gate shape below are retained for history. The present status is
> **CAPTURE PENDING — AUTHORIZED STAGING RESOURCES/WINDOWS REQUIRED**; P0.1 has not been evaluated.

This reference is the compact contract for Sprint 6 operators, reviewers, and report authors. The source of scenario and load-profile truth remains [`benchmarks/scenarios.json`](../../benchmarks/scenarios.json) and [`benchmarks/profiles.json`](../../benchmarks/profiles.json); the runner is [`scripts/benchmark.mjs`](../../scripts/benchmark.mjs) and the release check is [`scripts/release-gate.mjs`](../../scripts/release-gate.mjs).

## Contract

Every report must identify the scenario, journey, adapter, revision, capture time, region, runtime, Stellar network, dependency versions, profile, run ID, sample size, concurrency, and timeout. A live HTTP capture must also preserve successful sample count, error count, timeout count, throughput, p50, p95, p99, and one raw sample per request. A lifecycle fixture must retain stage timestamps and its confirmation definition.

The required evidence sequence is:

```text
scenario contract -> dry-run validation -> authorized capture -> report review -> release gate -> approved claim
```

Dry-run statuses prove only that a contract can be exercised. `captured` proves only that an adapter produced live output. Qualification is a separate decision based on authorization, completeness, comparability, and the gate thresholds.

## SLO and baseline rules

- The baseline must be a separately authorized capture of the reference revision, with the same payload, profile, region, runtime, network, dependencies, confirmation definition, sample size, and concurrency as the comparison.
- The release packet requires three complete benchmark runs/windows, p95 and p99 distributions, at least 1,000 successful samples per headline scenario per required run, and error rate below 0.5%.
- Growth-load p99 must have an explicit explanation. A missing explanation fails the gate even when the percentile exists.
- A baseline comparison fails when p95 regresses by more than 5% unless an explicitly approved exception is attached.
- Non-HTTP scenarios with no supplied fixture remain `fixture_capture_required` and cannot establish an SLO.
- “Request accepted,” “transaction submitted,” “payment confirmed,” “webhook acknowledged,” and “UI rendered” are different measurements. Do not combine them into one latency claim.

The checked-in local report is **non-qualifying** and is not a baseline: it contains 25 errors in 1,000 samples (2.5%), has only one run, and exceeds the 0.5% error threshold. The authoritative pending artifact is [`sprint-1-pending.json`](../../benchmarks/baselines/sprint-1-pending.json).

## Report review fields

| Review question             | Required evidence                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| What was measured?          | Scenario, journey, adapter, payload, and confirmation definition                         |
| Where and when?             | Revision, capture time, region, runtime, network, dependencies, and profile              |
| Was it live and authorized? | Capture authorization and environment record                                             |
| Is it complete?             | Three windows, sample counts, raw samples, errors, timeouts, p50/p95/p99, and throughput |
| What does a 503 mean?       | HTTP status and correlation ID plus an operator-confirmed API/downstream attribution     |
| Can it be compared?         | Matching semantics, conditions, and documented feature differences                       |
| Is the claim approved?      | Gate output and Product/Architecture approval linked to raw files                        |

Never infer a downstream cause from an HTTP status alone. For the current payment-intent create path, `503 anchor_unavailable` is the API classification; PDAX timeout, invalid response, request failure, or unresolved cause requires correlated logs.
