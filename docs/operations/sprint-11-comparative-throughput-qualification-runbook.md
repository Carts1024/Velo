# Sprint 11 Comparative Throughput Qualification Runbook

Status: **IMPLEMENTED — LIVE EVIDENCE PENDING**

This runbook is for an authorized staging operator. Repository commands generate plans, pending
reports, merges, and deterministic gate output; they do not provision staging, fund wallets, drive
Chromium, or execute a production load test.

## 1. Preconditions and authorization

Before a qualification window, obtain written authorization for load, provider degradation, replay,
backlog, telemetry toggling, deployment, and rollback. Record the baseline and candidate revisions,
infrastructure and deployment digests, region, dependencies/endpoints, wallet funding receipt,
asset IDs, confirmation definition/source, UTC windows, and raw-artifact destination. Keep bearer
tokens, HMAC secrets, wallet keys, traces, telemetry, and raw JSON/NDJSON outside the repository.

The draft manifest leaves these fields unresolved intentionally. Do not freeze until the approved
staging values, soak duration, capacity search (`minRps`, `maxRps`, `stepRps`, `resolutionRps`),
recovery deadline, and applicable arms are present.

## 2. Inspect and freeze the manifest

From the repository root:

```bash
pnpm benchmark:s11:plan
pnpm benchmark:s11:self-test
```

Review the three UTC windows, seven scenarios, temperatures, arms, 20% headroom, 0.5% exclusive
error threshold, 99.9% correlation requirement, 3% telemetry-overhead ceiling, and minimum 1,000
successful samples per normal/growth cell. Freeze only from a clean revision:

```bash
node scripts/benchmark-s11.mjs freeze --revision <approved-commit>
```

The freeze command reads `git status --porcelain`; any dirty path or unresolved revision is refused.
It writes `status: "frozen"`, `frozenRevision`, `frozenAt`, and a canonical SHA-256
`manifestDigest`. Preserve that digest with every capture and approval.

If the manifest changes later, run the drift classifier in a reviewed change. Candidate/baseline,
scenario/profile/temperature/arm, or confirmation changes invalidate affected candidate captures and
matched pairs. Infrastructure, window policy, workload, telemetry, SLO, schema, or artifact-storage
changes invalidate the complete qualification and require a new freeze.

## 3. Capture matched cohorts

Create one cohort ID and execute baseline and candidate under equivalent infrastructure, payloads,
confirmation semantics, and windows. Normal and growth retain the seven journeys:

```text
payment-intent-create, payment-intent-list, checkout-preparation,
transaction-submission, confirmation-detection, ui-propagation, webhook-delivery
```

Capture cold and warm distributions in each of the three UTC windows. The broader arms cover burst,
soak, degraded-provider, replay/idempotency, backlog recovery, telemetry on/off, saturation/recovery,
and rollback as applicable in the approved manifest. Every run must include a unique run ID, subject,
cohort, arm/profile, window, temperature, attempted/successful samples, p50/p95/p99 latency,
correlation coverage, telemetry state, and a SHA-256 raw-artifact reference. Cold runs also require
an attested reset.

The external controller must attest operations with matching manifest, deployment, and
infrastructure digests. Supported operations are `reset`, `degrade`, `recover`, `replay`, `backlog`,
`telemetry`, `deployment`, and `rollback`. Preserve controller checkpoints and event payload digests.

## 4. Capacity search and interruption recovery

Use staircase steps followed by bounded refinement within the frozen search bounds. A step is
sustainable only when latency, error rate, correctness, backlog, saturation/recovery, correlation,
telemetry, and raw-evidence gates pass. The lowest sustainable result across required windows must
cover each committed operating point with the configured headroom.

If a run is interrupted, do not edit or reuse partial evidence. Resume only with a checkpoint whose
manifest, deployment, and infrastructure digests all match:

```bash
pnpm benchmark:s11:resume --checkpoint <checkpoint.json> \
  --deployment <deployment-sha256> \
  --infrastructure <infrastructure-sha256>
```

Digest mismatch is a hard refusal. Append the resumed events to the external raw evidence set.

## 5. Merge, regression, and gate

Merge window reports without rewriting run identities:

```bash
pnpm benchmark:s11:merge --inputs <morning.json,afternoon.json,evening.json>
pnpm benchmark:s11:regression --report <report.json>
pnpm benchmark:s11:gate --report <report.json>
pnpm benchmark:s11:report --report <report.json>
```

The gate rejects digest mismatches, duplicate run identities, unmatched baseline/candidate normal or
growth cells, failed thresholds, duplicate financial/webhook effects, unbounded external calls,
unowned unresolved operations, unexplained p99 findings, insufficient samples, and headroom shortfall.
Missing required evidence is `EVIDENCE_PENDING`, not a pass. `benchmark:s11:gate` also requires
Product and Architecture approvals bound to the final `evidenceDigest`.

Store the machine result and approval result separately. Only a `PASS` plus both approvals may
produce a public claim. A report with no captures must remain `EVIDENCE_PENDING`/`PENDING`.

## 6. Evidence handling and rollback

Commit only compact `benchmarks/evidence/sprint-11/` metadata: evidence manifest, qualification
report/summary, and release decision. Keep raw artifacts external and reference their immutable
SHA-256 digests. If rollback is exercised, retain deployment/rollback attestations, recovery
evidence, and post-rollback performance in the same external evidence set. Treat a failed rollback,
non-recovery by the deadline, or post-rollback regression as a release blocker; the current
deterministic evaluator can classify the supplied evidence as failure or pending, but it cannot
invent an attestation that was not captured.

Do not publish a named competitor comparison without a supplied adapter containing authorization,
equivalent confirmation semantics, matched conditions, feature differences, and uncertainty. The
current Sprint 11 record makes no comparative claim.

## 7. Validation commands

```bash
pnpm benchmark:s11:test
pnpm benchmark:gate:test
pnpm benchmark:test
pnpm test
pnpm build
pnpm lint:fix
cd contracts/registry && cargo test
```

These commands validate deterministic implementation and repository integration. They are not a
substitute for authorized staging capacity, reliability, recovery, rollback, or competitor evidence.

See the [architecture record](../architecture/sprint-11-comparative-throughput-certification.md)
and [current qualification report](../references/sprint-11-comparative-throughput-qualification-report.md).
