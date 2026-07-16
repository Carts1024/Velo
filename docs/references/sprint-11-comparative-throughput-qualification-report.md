# Sprint 11 Comparative Throughput Qualification Report

Status: **EVIDENCE_PENDING**  
Date: 2026-07-14

## Current disposition

The Sprint 11 implementation is complete at deterministic contract and test level. Live
comparative throughput certification is not complete because this repository has no authorized
staging capture, immutable baseline/candidate deployment pair, funded-wallet receipt, raw evidence
set, or Product/Architecture approval packet.

The canonical tracked artifacts are:

- [`benchmarks/sprint11/manifest.json`](../../benchmarks/sprint11/manifest.json) — manifest version 4,
  evidence schema 3, draft/unresolved staging values.
- [`benchmarks/sprint11/evidence-schema.json`](../../benchmarks/sprint11/evidence-schema.json) —
  report shape and verdict enums.
- [`benchmarks/evidence/sprint-11/evidence-manifest.json`](../../benchmarks/evidence/sprint-11/evidence-manifest.json)
  — raw-artifact boundary and pending reason.
- [`benchmarks/evidence/sprint-11/qualification-report.json`](../../benchmarks/evidence/sprint-11/qualification-report.json)
  — empty pending cohort.
- [`benchmarks/evidence/sprint-11/qualification-summary.json`](../../benchmarks/evidence/sprint-11/qualification-summary.json)
  and [`release-decision.json`](../../benchmarks/evidence/sprint-11/release-decision.json) — compact
  release metadata.

## Implementation evidence

| Area | Repository evidence | Disposition |
| --- | --- | --- |
| Versioned contract | `sprint11-contract.mjs`, manifest v4/schema v3 | Deterministic pass |
| Freeze and drift | clean-revision check, canonical SHA-256 digest, candidate/full reset classification | Deterministic pass |
| Matched cohorts | baseline/candidate pairing by arm, profile, window, temperature, and rate | Harness implemented; captures pending |
| Capacity | passing-step selection with staircase + bounded-refinement label and headroom check | Mathematics implemented; live throughput pending |
| Controller | digest-bound attestations for reset/degrade/recover/replay/backlog/telemetry/deployment/rollback | Contract implemented; external controller pending |
| Evidence gates | latency, error, correlation, telemetry, raw digest, reset, samples, side effects, ownership, p99 | Deterministic checks implemented |
| Release decision | independent machine verdict and approval status; public claim requires both approvals | Pending (`EVIDENCE_PENDING` / `PENDING`) |
| Competitor adapter | optional strict contract with authorization and uncertainty fields | No adapter or claim supplied |

## Verdict semantics

`machineVerdict` is computed from evidence: `FAIL` means an observed gate failure, while
`EVIDENCE_PENDING` means required evidence is absent. `approvalStatus` is independent and remains
`PENDING` until Product and Architecture approvals both reference the final evidence digest.
`publicClaim` remains `null` unless the machine verdict is `PASS` and both approvals are approved.

The checked-in report therefore intentionally records:

```json
{
  "machineVerdict": "EVIDENCE_PENDING",
  "approvalStatus": "PENDING",
  "publicClaim": null
}
```

Sprint 9 and Sprint 10 remain separately pending; Sprint 11 does not rewrite historical evidence or
turn deterministic tests into a live certification.

## Closure requirements

To replace this pending status, an authorized evidence packet must include the frozen manifest digest,
baseline and candidate revision/infrastructure/deployment digests, all required matched cells and
windows, raw artifact SHA-256 references, controller reset/degradation/recovery/replay/backlog/
telemetry/rollback attestations, capacity search and soak results, Sprint 10 observability evidence,
P0.1/P0.5 acceptance evidence, duplicate-effect and external-call checks, and Product/Architecture
approval records bound to the final evidence digest. Any named competitor additionally requires the
validated adapter fields; otherwise no comparative claim may be published.

Raw JSON/NDJSON, traces, telemetry, credentials, and wallet material remain external. Only compact,
truthful metadata should be committed under `benchmarks/evidence/sprint-11/`.

See the [architecture](../architecture/sprint-11-comparative-throughput-certification.md) and
[operator runbook](../operations/sprint-11-comparative-throughput-qualification-runbook.md) for
the implementation boundary and authorized procedure.
