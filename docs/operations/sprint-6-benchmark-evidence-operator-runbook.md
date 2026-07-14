# Sprint 6: Benchmark Evidence Operator Runbook

> **Sprint 9 status update — 2026-07-13:** This document preserves the Sprint 6 evidence
> vocabulary and history; it is not the current operator procedure. Use the
> [Sprint 9 architecture](../architecture/sprint-9-real-lifecycle-benchmark-architecture.md),
> [operator runbook](./sprint-9-real-lifecycle-benchmark-runbook.md), and
> [evidence and closure record](../references/sprint-9-benchmark-evidence-and-closure.md).
> The repository now contains runner/gate engineering and signed client contracts for seven
> scenarios, but it does not contain the staging controller handlers required by the five control
> scenarios. Capture is pending and P0.1 is not qualified.

This runbook defines how to validate, capture, qualify, and investigate Sprint 6 benchmark evidence. It is an operator procedure, not a performance result. A checked-in JSON file is evidence only when its capture authority, environment, semantics, and quality gates are documented.

## Evidence status vocabulary

| Status                       | Meaning                                                                                                   | May support an SLO or external claim?          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `suite_validated`            | The complete scenario registry was checked in dry-run mode. No live samples were taken.                   | No                                             |
| `validated`                  | An HTTP scenario's request contract and required environment were validated in dry-run mode.              | No                                             |
| `fixture_contract_validated` | A non-HTTP scenario's declared fixture contract was checked in dry-run mode.                              | No                                             |
| `captured`                   | A live adapter wrote raw samples and aggregate fields. This says capture occurred, not that it qualifies. | Only after report and authorization gates pass |
| `fixture_capture_required`   | A live non-HTTP scenario still needs its declared browser, Stellar, or lifecycle fixture.                 | No                                             |

`captured` is not equivalent to `validated`, `suite_validated`, or `fixture_capture_required`, and none of those statuses is a substitute for a qualifying capture. Fixture output with no measured samples must remain excluded from claims.

## Current evidence disposition

The checked-in [`payment-intent-create.json`](../../benchmarks/reports/payment-intent-create.json) is `captured`, but it is **non-qualifying**:

- one `normal`-profile run is present, not the required three windows;
- it was captured from `local`, not an authorized release environment;
- it has 975 successful samples and 25 errors, a 2.5% error rate; and
- the release gate permits less than 0.5% errors.

Do not use its p50/p95/p99, throughput, or 503 count as a locked baseline, SLO, “faster” claim, or competitor comparison. The Sprint 1 pending baseline remains pending until an authorized baseline packet is captured.

## Before capture

1. Obtain written authorization for the Velo environment, benchmark API key, wallet/fixture identities, and any competitor test. Do not place credentials, signed XDR, or private wallet material in the repository.
2. Pin the revision, Node and pnpm versions, client region, Stellar network, dependency versions, payload, sample size, concurrency, timeout, and profile.
3. Confirm the exact journey and confirmation definition. `payment-intent-create` measures the HTTP create response, not wallet signing, Stellar finality, webhook acknowledgement, or payment confirmation.
4. For an SLO baseline, capture the baseline from the authorized reference revision under the same conditions. Never promote the checked-in report, a local run, a dry run, or `sprint-1-pending.json` to baseline.

## Operator commands

Validate the registry without network calls:

```bash
pnpm benchmark:smoke
```

Capture an authorized HTTP run. Supply real values only in the operator environment:

```bash
VELO_BENCHMARK_BASE_URL=https://<authorized-velo-origin> \
VELO_BENCHMARK_API_KEY=<authorized-benchmark-key> \
VELO_BENCHMARK_REGION=<client-region> \
VELO_BENCHMARK_NETWORK=<stellar-network> \
VELO_BENCHMARK_DEPENDENCY_VERSIONS=<pinned-dependencies> \
VELO_BENCHMARK_REVISION=<captured-commit> \
VELO_BENCHMARK_PROFILE=normal \
node scripts/benchmark.mjs \
  --scenario payment-intent-create --samples 1000 --concurrency 25 \
  --out benchmarks/reports/<utc-timestamp>-payment-intent-create.json
```

Inspect status, counters, and HTTP status attribution without printing request payloads:

```bash
node -e 'const fs=require("fs"); const r=JSON.parse(fs.readFileSync(process.argv[1])); const counts=Object.groupBy(r.samples??[], s=>String(s.status)); console.log(JSON.stringify({status:r.status,runId:r.runId,profile:r.profile,successfulSamples:r.successfulSamples,errors:r.errors,timeouts:r.timeouts,latencyMs:r.latencyMs,httpStatusCounts:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v.length]))},null,2))' \
  benchmarks/reports/<utc-timestamp>-payment-intent-create.json
```

Run the release gate only against a report assembled from complete captured runs:

```bash
pnpm benchmark:gate -- --report benchmarks/reports/<qualified-report>.json
```

The gate does not capture data. A missing report, fewer than three runs, non-`captured` scenarios, missing p95/p99, unexplained growth p99, error rate at or above 0.5%, or an over-5% baseline p95 regression is a failed release check.

## 503 attribution procedure

For `payment-intent-create`, a 503 with `code: "anchor_unavailable"` means the API's requested payment anchor was unavailable. The current implementation maps PDAX deposit-address lookup timeout, invalid lookup response, and lookup failure to that same internal code before the route returns 503. The benchmark sample records status, duration, timeout, and correlation ID; it does not record the response body or prove which downstream condition caused the error.

When 503s appear:

1. Count them as errors; do not remove them from the denominator or latency incident record.
2. Preserve the report's `runId`, sample number, correlation ID, timestamp, revision, region, and profile.
3. Use the correlation ID and capture time to inspect the authorized API/Convex logs. Confirm whether the response body was `anchor_unavailable`, then identify whether the correlated action logged a PDAX timeout, invalid response, connection/provider failure, or another lookup failure.
4. Check that no partial payment intent was written for the failed lookup. Do not retry an unknown payment side effect merely to improve benchmark counts.
5. Record the attribution in the report review: `anchor_unavailable` is the API classification; the downstream cause is `pdax_timeout`, `pdax_invalid_response`, `pdax_request_failure`, or `unresolved` only when the trace proves it.

An HTTP 503 alone must never be labeled “PDAX outage.” If logs cannot resolve the downstream cause, report `anchor_unavailable / unresolved` and escalate to the API and PDAX owners.

## Qualification and handoff

An operator may hand evidence to Product and Architecture only when the report includes the required metadata and raw samples, uses an authorized environment and baseline where applicable, contains three distinct windows, and passes the release gate. Non-HTTP journeys remain `fixture_capture_required` until their declared fixture produces stage timings. The final report must link raw files, state the confirmation definition, explain exclusions, and distinguish Velo-controlled, provider, wallet, Stellar, queue, and merchant time.

Until that handoff is approved, use “benchmark in progress” and “non-qualifying captured run,” never “SLO met,” “production-ready,” or “faster.”
