# Sprint 10 Observability, Redaction, and Overhead Report

Status: **IMPLEMENTED — LIVE EVIDENCE PENDING**

Date: 2026-07-14

## Verdict

Sprint 10 is implemented at code and deterministic-test level. It is not live-qualified.

The repository now contains the OTLP contracts and exporters, route correlation boundary, cross-service propagation, Convex telemetry outbox, UI intake, journey reconstruction, bounded gauges, redaction migration tools, local Grafana/Tempo/Loki/Prometheus/Collector stack, dashboards, alerts, and overhead gate mathematics.

The following claims remain explicitly pending:

- a staging synthetic journey reconstructed from retained live OTLP data;
- a paired staging measurement proving telemetry overhead is below `3%` at p95;
- a deployed data scan proving every legacy diagnostic row has been migrated;
- the later narrowing deployment that removes legacy diagnostic fields.

Sprint 9 remains unqualified because its authorized staging controller and live capture are absent. Sprint 10 does not rewrite or upgrade that historical claim.

## Implementation evidence

| Acceptance area          | Implemented evidence                                                                                | Status                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Runtime-neutral contract | `packages/observability` catalogs, validators, projection, sampling, OTLP IDs                       | Pass, deterministic                    |
| Route coverage           | Filesystem-derived matrix asserts 16 public/provider Next.js methods use `withRouteTelemetry`       | Pass, deterministic                    |
| Response correlation     | Success, handled error, and thrown-error tests cover both correlation headers                       | Pass, deterministic                    |
| Propagation              | SDK, PDAX, Stellar RPC/Horizon, Convex workers, provider ingress, and webhooks carry safe context   | Pass, deterministic                    |
| Journey reconstruction   | Ownership-checked indexed query returns ordered stages, traceparents, and missing-stage diagnostics | Pass, deterministic                    |
| UI intake                | Same-origin, size, rate, marker, duration, secret, and existing-intent checks                       | Pass, deterministic                    |
| Outbox                   | 100-row claims, lease fencing, five retries, dead letters, expiry, deletion on success              | Pass, deterministic                    |
| Redaction                | Summary-only new provider ingress plus paginated migrate/verify functions                           | Code pass; deployed migration pending  |
| Cardinality              | 10,000 generated entity identifiers cannot become metric-label keys                                 | Pass, deterministic                    |
| Local stack              | Compose, Collector pipelines, retention, dashboard, PromQL, owners, anchors                         | Pass, deterministic                    |
| Synthetic journey        | In-memory API → Convex → provider/submission → observation → state → webhook → UI ordering          | Pass, deterministic; live OTLP pending |
| Overhead                 | Alternation, metadata, sample-count, p95, and strict `<0.03` gate mathematics                       | Harness pass; live verdict pending     |

## Public interface changes

- Every public Next.js method returns `X-Correlation-Id`; `X-Request-Id` remains the compatibility alias.
- Payment-intent JSON and SDK `PaymentIntent` add optional durable `correlationId`.
- Accepted payment-intent responses expose `X-Velo-Journey-Id`.
- SDK `RequestOptions` adds optional W3C `traceparent` propagation.
- PDAX and Stellar helpers accept optional `TelemetryContext` and inject supported safe headers.
- Scheduled Convex functions receive typed internal context; no unrestricted public telemetry argument was added.

These additions are backward-compatible because the new SDK response and request fields are optional.

## Deterministic validation record

The final implementation handoff reported these current-tree checks as passing:

- `@repo/observability` contract and 10,000-identifier cardinality tests;
- web TypeScript compilation and 16 test files, 48 tests total;
- backend TypeScript compilation and 12 test files, 53 tests total;
- PDAX, public SDK, and Stellar test suites; Stellar contains 31 passing tests;
- observability asset and overhead-gate tests;
- Next.js production build;
- frozen lockfile installation check;
- Docker Compose configuration rendering;
- oxlint and `git diff --check`.

The root release gate has a separate pre-existing fixture gap: `benchmarks/reports/payment-intent-create.json` is absent. That does not convert Sprint 10’s pending live evidence into a pass or failure.

## Locked scenario thresholds

The implementation emits a locked SLO gauge for each `benchmarks/manifest.json` p95 threshold and joins it with the 10-minute p95 recording rule.

| Scenario                 | Locked p95 |
| ------------------------ | ---------: |
| `payment-intent-create`  |     0.35 s |
| `payment-intent-list`    |     0.25 s |
| `checkout-preparation`   |      1.5 s |
| `transaction-submission` |        3 s |
| `confirmation-detection` |        8 s |
| `ui-propagation`         |     0.35 s |
| `webhook-delivery`       |        2 s |

No threshold is adjusted from observed performance. The alert expression is:

```promql
velo_journey_p95_seconds > on(operation) velo_locked_slo_p95_seconds
```

The recording rule is:

```promql
histogram_quantile(0.95, sum by (le, operation) (rate(velo_journey_duration_seconds_bucket[10m])))
```

## Overhead qualification contract

The checked-in harness requires, independently for normal and warm profiles:

1. three alternating telemetry-disabled/telemetry-enabled pairs;
2. matching revision, cohort, and payload hash within each pair;
3. at least 1,000 successful durations in each arm;
4. p95 computed from sorted successful durations;
5. strict overhead ratio below `0.03`.

```text
overhead = (enabled p95 - disabled p95) / disabled p95
pass only when overhead < 0.03
```

The unit fixture proves that `2%` passes and exactly `3%` fails. It does not contain or stand in for staging measurements.

## Security and redaction evidence

- Structured projection is allowlist-only; hostile nested/cyclic values and unknown fields are discarded.
- Metric labels exclude correlation, entity, customer, account, and wallet identifiers.
- Provider callback ingress stores typed summary fields and a digest, not the raw callback body.
- Error telemetry uses stable codes rather than arbitrary exception strings.
- Journey reconstruction verifies project ownership before indexed reads.
- UI measurements are bounded, labelled operationally untrusted, and cannot mutate payment state.
- Operational settlement/reconciliation fields remain behind their existing authorization boundary and are excluded from telemetry projection.

The schema still contains optional legacy diagnostic fields during the widening deployment. Production redaction is complete only after migrate, full verify, and a later narrowing deployment.

## Retention and ownership

| Data or alert area                        | Retention / owner       |
| ----------------------------------------- | ----------------------- |
| Traces                                    | 14 days                 |
| Sanitized logs                            | 14 days                 |
| Metrics                                   | 90 days                 |
| Telemetry dead letters and journey stages | 14 days                 |
| API correlation/error alerts              | `API/Web`               |
| Scenario latency/exporter alerts          | `Payments Backend`      |
| Provider circuit alert                    | `Settlement/PDAX`       |
| Queue/backlog alert                       | `Webhooks/Integrations` |

Operational procedures and concrete alert anchors are in the [Sprint 10 runbook](../operations/sprint-10-observability-and-redaction-runbook.md). The component and data-flow design is in the [Sprint 10 architecture](../architecture/sprint-10-end-to-end-observability-and-redaction.md).

## Evidence still required for closure

To change the status from **LIVE EVIDENCE PENDING**, retain an authorized external evidence set that contains:

- deployment revision and collector configuration identity;
- one complete live journey ID with API, Convex, provider/submission, ledger observation, state update, webhook acknowledgement, and UI render;
- missing-stage result equal to an empty list for that journey;
- normal and warm paired capture metadata and at least 1,000 successes per arm;
- calculated disabled p95, enabled p95, and overhead ratio for each profile;
- a paginated redaction verification result of zero forbidden rows before schema narrowing.

Raw traces and captures remain external. Only a compact manifest and truthful qualification summary should be committed.
