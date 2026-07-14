# Sprint 9 Benchmark Evidence and Closure

## Decision

**CAPTURE PENDING — AUTHORIZED STAGING RESOURCES/WINDOWS REQUIRED**

- Runner and qualification-gate engineering: implemented and deterministically tested.
- External operator controller: not present in this repository; conformance remains open.
- Authorized live evidence: none recorded.
- P0.1: **not qualified and not evaluated**.
- External performance or competitive claim: prohibited.

The source design is the
[Sprint 9 benchmark architecture](../architecture/sprint-9-real-lifecycle-benchmark-architecture.md),
and the capture procedure is the
[Sprint 9 operator runbook](../operations/sprint-9-real-lifecycle-benchmark-runbook.md). Sprint 8's
[architecture](../architecture/sprint-8-durable-financial-reliability.md) and
[operations runbook](../operations/sprint-8-durable-financial-reliability-runbook.md) remain the
durability predecessors.

## Two-phase closure

| Phase                         | Closure question                                                                                                                                                                                      | Current evidence                                                                                                                         | Status                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A — source and live-readiness | Are repository runner/gate, lifecycle clocks, cold attestations, browser markers, raw merge/recomputation, and financial-path correctness implemented; is a conforming external controller available? | Repository implementation and deterministic tests exist. The operator controller handlers and their staging conformance evidence do not. | **OPEN — runner/gate implemented; controller integration pending** |
| B — live qualification        | Did one authorized frozen cohort complete all three windows and pass every locked gate against checksum-verifiable raw evidence?                                                                      | No authorized Sprint 9 capture or approved baseline packet is recorded.                                                                  | **NOT EVALUATED**                                                  |

Phase A test success is correctness evidence, not latency, throughput, availability, or scale
evidence. Phase B cannot be inferred from Phase A.

## Required 84-cell matrix

Each table entry represents the three required windows in `morning / afternoon / evening` order.
`P/P/P` means all three cells are pending; it is not a measured value.

| Scenario                 | Normal cold | Normal warm | Growth cold | Growth warm | Required cells |
| ------------------------ | ----------- | ----------- | ----------- | ----------- | -------------: |
| `payment-intent-create`  | P/P/P       | P/P/P       | P/P/P       | P/P/P       |             12 |
| `payment-intent-list`    | P/P/P       | P/P/P       | P/P/P       | P/P/P       |             12 |
| `checkout-preparation`   | P/P/P       | P/P/P       | P/P/P       | P/P/P       |             12 |
| `transaction-submission` | P/P/P       | P/P/P       | P/P/P       | P/P/P       |             12 |
| `confirmation-detection` | P/P/P       | P/P/P       | P/P/P       | P/P/P       |             12 |
| `ui-propagation`         | P/P/P       | P/P/P       | P/P/P       | P/P/P       |             12 |
| `webhook-delivery`       | P/P/P       | P/P/P       | P/P/P       | P/P/P       |             12 |
| **Total**                | **21**      | **21**      | **21**      | **21**      |         **84** |

The gate requires exactly one run per cell and at least 1,000 successful samples in every cell. The
runner's checked-in 300-second profiles schedule at least 3,000 normal and 15,000 growth attempts
per cell; those planned attempts do not satisfy the success requirement by themselves.

## Locked SLOs

These are qualification thresholds from [`benchmarks/manifest.json`](../../benchmarks/manifest.json),
not achieved measurements:

| Scenario                 | p50 (ms) | p95 (ms) | p99 (ms) |
| ------------------------ | -------: | -------: | -------: |
| `payment-intent-create`  |      150 |      350 |      750 |
| `payment-intent-list`    |      100 |      250 |      500 |
| `checkout-preparation`   |      500 |    1,500 |    3,000 |
| `transaction-submission` |    1,000 |    3,000 |    8,000 |
| `confirmation-detection` |    3,000 |    8,000 |   15,000 |
| `ui-propagation`         |      100 |      350 |      750 |
| `webhook-delivery`       |      500 |    2,000 |    5,000 |

The final code applies the baseline-relative p95 gate to every scenario: each cell's p95 must be no
more than 5% above the approved baseline p95 for that scenario. This is stricter than describing the
baseline-relative rule as transaction-submission-only.

## Complete qualification contract

The gate returns `pass` only when all of these conditions hold:

| Area                | Locked requirement                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matrix              | Exactly 84 unique cells: seven scenarios × normal/growth × cold/warm × three windows                                                                  |
| Samples             | At least 1,000 successful samples per cell and at least 84,000 in aggregate                                                                           |
| Evidence mode       | Every run is `captured`, `capture`, and `real`; fixture/dry-run output is rejected                                                                    |
| Load                | Normal is 10 arrivals/s at concurrency 25; growth is 50 arrivals/s at concurrency 100; arrival rate and successful throughput must meet target        |
| Saturation          | Zero dropped arrivals and zero saturated arrivals                                                                                                     |
| Error budget        | Error rate is strictly below 0.5% in every cell                                                                                                       |
| HTTP 503            | Counts reconcile with taxonomy and every 503 is attributed; an unexplained 503 fails                                                                  |
| SLO                 | p50, p95, and p99 meet the table above; distributions are ordered and use milliseconds                                                                |
| Baseline            | Approved baseline metadata covers all seven scenario p95 values; cell p95 regression is no more than 5%                                               |
| Contributors        | Exact top three Velo-controlled contributors recomputed and globally ranked from successful raw-sample dependency timings                             |
| Lifecycle           | Every required metric covers every successful sample and matches its declared event boundaries and clock provenance                                   |
| Raw evidence        | NDJSON SHA-256 and record counts match; run counters match; lifecycle distributions are recomputed exactly from raw samples                           |
| HTTP outcome        | Successful raw HTTP samples contain the registry's required public response shape                                                                     |
| Cold evidence       | Every successful cold sample has a capture/cohort/sample-bound HMAC reset attestation; the gate reverifies it with `VELO_BENCHMARK_CONTROL_SECRET`    |
| Correlation         | At least 99.9% of successful raw samples carry correlation IDs                                                                                        |
| Fixture lifecycle   | Every run has authorized cohort setup and controlled cleanup receipts                                                                                 |
| Windows             | Three unique immutable captures; morning 00–08, afternoon 08–16, evening 16–24 UTC; both boundaries inside the window; at least 60 minutes separation |
| Frozen identity     | Report, source captures, and runs share one resolved revision, cohort, and approved baseline; contributor ranking is raw-derived                      |
| Threshold integrity | CLI gate overrides are forbidden                                                                                                                      |

The merge and gate require raw artifacts to remain adjacent to their reports by safe relative path.
The merge streams NDJSON, and the gate builds a streaming raw index; compact summary fields never
replace raw verification.

## Source-correctness evidence versus performance evidence

Sprint 9 source changes provide deterministic correctness coverage for:

- seven executable adapter client contracts and HMAC request construction;
- setup/prime/execute/cleanup ownership, receipts, public HTTP outcome validation, and per-sample
  cold reset verification;
- lifecycle event/metric and clock-provenance validation;
- exact raw-distribution recomputation, window identity, immutable merge, and qualification rules;
- browser marker emission behind a default-false public build flag;
- idempotent `reportSubmitted` clocks and watcher ownership;
- ledger payment matching by effective source, destination, stroop-exact amount, canonical asset,
  and reported payer;
- one-intent `verifiedTxHash` ownership and atomic paid/credit/webhook transition; and
- webhook retry-time enforcement, lease/deadline separation, and terminal short-circuit behavior.

These checks establish code behavior only. They do not establish that staging can sustain the
normal/growth profiles or meet any percentile.

## Pending prerequisites and risks

Phase A and Phase B remain open until the following exist:

1. A default-disabled, staging-only controller implementing the two HTTP setup/reset/cleanup paths
   and five control setup/prime/execute/cleanup paths.
2. Controller conformance evidence for bearer/HMAC/timestamp/nonce/body-digest verification,
   per-sample cold reset attestations, cohort receipts, clock provenance, Chromium markers, wallet,
   Horizon, Convex/RPC, UI, and webhook behavior.
3. Written load authorization and three compliant UTC capture windows.
4. Dedicated API/controller credentials, a funded controlled Stellar signer, required assets and
   trustlines, and a controlled receiver/merchant endpoint.
5. One reviewed approved baseline packet and measured contributor packet; the existing
   [`sprint-1-pending.json`](../../benchmarks/baselines/sprint-1-pending.json) remains explicit proof
   that no authorized baseline is checked in.
6. A recorded disposition for the unbounded `getProjectStats` collections, which can approach
   Convex read limits as the cohort grows.
7. A recorded load-probe disposition for shared `rateLimitBuckets` writes and their Convex
   optimistic-concurrency risk.
8. Immutable external storage and retention ownership for source/final reports and NDJSON.

Neither Convex audit item is claimed fixed by Sprint 9. A qualification window must stop if either
changes the intended shared-cohort semantics or makes the load profile unreliable.

## Evidence status vocabulary

| Status                                                            | Use                                                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `CAPTURE PENDING — AUTHORIZED STAGING RESOURCES/WINDOWS REQUIRED` | Current state: prerequisites or windows are missing; no qualification evidence exists         |
| `CAPTURED — VALIDATION PENDING`                                   | All raw windows exist, but merge/gate/review is incomplete                                    |
| `NOT QUALIFIED — <reason>`                                        | Capture or gate completed but at least one named requirement failed or evidence is incomplete |
| `QUALIFIED — ALL REQUIRED CELLS AND GATES PASSED`                 | Locked gate passed and evidence was independently checksum/retrieval reviewed                 |

`ENGINEERING COMPLETE` must not be used as the overall status while the external controller and its
conformance work are missing. `suite_validated`, `window_completed`, `suite_completed`, and a
generated Markdown report are implementation artifact statuses, not approval statuses.

“P0.1 passed” is allowed only with `QUALIFIED`, a preserved passing gate output, retrievable raw
evidence, and recorded Product/Architecture approval.

## Raw evidence and tracked index

| Artifact                                                                                      | Git policy             | Required retained metadata                                 |
| --------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| Three source window JSON reports                                                              | External/ignored       | URI, SHA-256, bytes, capture ID, start/end, retention      |
| Three source NDJSON files                                                                     | External/ignored       | URI, SHA-256, bytes, records, window, retention            |
| Merged qualification JSON                                                                     | External/ignored       | URI, SHA-256, bytes, revision/cohort, retention            |
| Merged qualification NDJSON                                                                   | External/ignored       | URI, SHA-256, bytes, records, retention                    |
| Gate JSON output and generated Markdown                                                       | External/ignored       | URI, SHA-256, tool revision, review result                 |
| [`qualification-summary.json`](../../benchmarks/evidence/sprint-9/qualification-summary.json) | Tracked compact record | Status, contract counts, verdict, blockers; no raw samples |
| [`evidence-manifest.json`](../../benchmarks/evidence/sprint-9/evidence-manifest.json)         | Tracked compact index  | External artifact URIs/checksums/retention; no secrets     |

Raw evidence must exclude credentials, controller secrets, signer material, signed XDR, and full
private webhook payloads. Access-controlled evidence may still contain identifiers and topology;
apply the authorization's retention and access policy.

## Documentation transition after live capture

Before capture, this document and both compact JSON files must remain pending and contain no
observed percentiles, throughput, or pass language.

After authorized capture:

1. Preserve the exact revision, controller version/config digest, cohort, authorization, baseline,
   contributor set, clocks, topology, and source capture boundaries.
2. Add external artifact URIs, SHA-256 values, sizes, record counts, and retention to the manifest.
3. Record matrix completeness and the unmodified gate result in the compact summary.
4. If the gate fails or evidence cannot be retrieved/checksum-matched, use `NOT QUALIFIED` and list
   every deficiency. Do not publish partial passing cells as P0.1.
5. Only after passing gate and review, replace the matrix `P` entries with links to the reviewed
   cell summaries, set `QUALIFIED`, and record approvers/date.
6. Update the Sprint 1 pending-baseline reference by adding a successor link; do not rewrite the
   historical pending artifact as though it had contained results.

## Closure validation checklist

- [ ] External controller handlers exist and pass staging conformance.
- [ ] Written authorization covers the full planned workload and all three UTC windows.
- [ ] Funding, assets/trustlines, receiver, and merchant endpoint are controlled and documented.
- [ ] Convex unbounded-read and OCC-contention findings have go decisions.
- [ ] All three 28-cell source reports and NDJSON artifacts are immutable.
- [ ] The merge produces exactly 84 unique runs without identity drift.
- [ ] The gate recomputes and verifies raw evidence and returns `pass` without overrides.
- [ ] External URIs, checksums, records, sizes, and retention are independently verified.
- [ ] Compact tracked summary/manifest contain no secrets or raw samples.
- [ ] Product and Architecture approve the exact claim language.

Until every item is complete, this Sprint remains capture pending or not qualified.
