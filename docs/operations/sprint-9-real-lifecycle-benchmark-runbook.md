# Sprint 9 Real-Lifecycle Benchmark Operator Runbook

## Current disposition

**CAPTURE PENDING — AUTHORIZED STAGING RESOURCES/WINDOWS REQUIRED.** The runner and gate are
implemented and deterministically tested. This repository does not contain the staging controller
handlers required by the seven adapter paths, and no authorized live capture exists. Do not use
`suite_validated`, a window report, or the pending templates as evidence that P0.1 passed.

Read the [Sprint 9 architecture](../architecture/sprint-9-real-lifecycle-benchmark-architecture.md)
before operating this runbook. The
[Sprint 8 reliability runbook](./sprint-8-durable-financial-reliability-runbook.md) remains the
predecessor for durable financial recovery. Record the final decision in the
[Sprint 9 evidence and closure record](../references/sprint-9-benchmark-evidence-and-closure.md).

## Stop conditions before capture

Do not start a qualification window until every item below has an owner and evidence:

- Written authorization names the staging deployment, load levels, UTC windows,
  `VELO_BENCHMARK_AUTHORIZATION_ID`, client region, project, API key, wallet/signer, assets,
  receiver, merchant webhook endpoint, and retention location.
- The external staging controller implements and passes conformance for all seven base paths. It is
  disabled by default, inaccessible in production, validates HMAC/timestamp/nonce/body digest, and
  performs cohort-scoped setup, cold reset, warm prime where applicable, execute, and cleanup.
- The controlled Stellar signer is funded on the authorized network; the required assets,
  trustlines, receiver address/memo, and sequence handling are verified. Signer secrets stay in the
  controller's secret store; this repository defines no signer environment variable.
- The staging web build has `NEXT_PUBLIC_VELO_BENCHMARK_MARKERS=true`, has been redeployed, and a
  Chromium/Playwright controller receives entity/version-bound checkout markers. The flag defaults
  to `false` and is compiled into the client bundle.
- Horizon, Convex, Stellar RPC, and the controlled merchant endpoint are reachable from the capture
  region. The controller demonstrates the real submission, `reportSubmitted`, ledger verification,
  subscribed UI, and durable webhook paths.
- The revision, cohort, payload/dataset identities, dependency topology, and approved baseline are
  frozen for all windows. Contributor rankings are derived from merged raw dependency timings, not
  supplied as trusted metadata.
- External immutable storage has enough capacity for three window JSON reports, three large NDJSON
  artifacts, the merged report/artifact, gate output, and checksums. None of these raw files belongs
  in Git.
- Clock synchronization and resolution are recorded for every controller clock. `unknown` is not
  accepted.
- The two Convex capture risks below have an explicit go/no-go disposition.

### Unresolved Convex capture risks

These are blockers or measured-risk preconditions, not fixed behavior:

1. `payment_intents.queries.getProjectStats` uses unbounded `.collect()` reads for project payment
   intents and webhook deliveries. The benchmark volume can bring subscribed dashboard reads near
   Convex limits. Confirm no session subscribes to that query for the benchmark project during a
   window, inspect current document volume/read behavior, and record the decision.
2. `rate_limits.mutations.consume` writes shared API-key and project `rateLimitBuckets`. Normal and
   growth traffic can produce optimistic-concurrency retries/conflicts on those rows. Run an
   authorized pre-capture load probe using the exact cohort, inspect Convex OCC/retry and 429 data,
   and stop if contention makes the target profile or latency semantics invalid.

Do not “solve” either risk by rotating API keys or projects between cells. The qualification gate
requires one frozen cohort across all three windows.

## Environment contract

Set secrets through the operator secret manager or process environment. Do not commit an
`.env.benchmark` file. The runner can load `.env`, `.env.local`, and `.env.benchmark` only on Node
versions that expose `process.loadEnvFile`; explicit secret injection is less ambiguous.

| Variable                                  | Required use                       | Secret?               | Rule                                                                                                        |
| ----------------------------------------- | ---------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `VELO_BENCHMARK_BASE_URL`                 | Both HTTP scenarios                | No                    | Authorized Velo origin; HTTPS; no URL credentials                                                           |
| `VELO_BENCHMARK_API_KEY`                  | Both HTTP scenarios                | Yes                   | Dedicated authorized key for the frozen project                                                             |
| `VELO_BENCHMARK_CONTROL_URL`              | All seven scenarios                | No                    | External staging controller origin; HTTPS                                                                   |
| `VELO_BENCHMARK_CONTROL_TOKEN`            | All seven scenarios                | Yes                   | Bearer scope must match the capture authorization                                                           |
| `VELO_BENCHMARK_CONTROL_SECRET`           | All seven scenarios and final gate | Yes                   | Signs requests and cold-reset attestations; gate needs it to reverify NDJSON                                |
| `VELO_BENCHMARK_AUTHORIZATION_ID`         | All capture cells                  | Sensitive metadata    | Must match controller responses and the written authorization                                               |
| `VELO_BENCHMARK_COHORT_ID`                | All capture cells                  | No                    | One frozen cohort ID across all windows                                                                     |
| `VELO_BENCHMARK_REGION`                   | Capture metadata                   | No                    | Capture client region; cannot be `unresolved`                                                               |
| `VELO_BENCHMARK_NETWORK`                  | Capture metadata                   | No                    | Authorized Stellar network; cannot be `unresolved`                                                          |
| `VELO_BENCHMARK_DEPENDENCY_ENDPOINTS`     | Capture metadata                   | Potentially sensitive | Sanitized, frozen dependency topology/endpoints                                                             |
| `VELO_BENCHMARK_PAYLOAD_IDENTITY`         | Capture metadata                   | No                    | Version/digest identifying the fixed request and payment shape                                              |
| `VELO_BENCHMARK_DATASET_IDENTITY`         | Capture metadata                   | No                    | Version/digest identifying the controlled cohort dataset                                                    |
| `VELO_BENCHMARK_BASELINE_JSON`            | Capture and gate input             | No secrets            | Approved baseline object for all seven scenario p95 values, with revision, timestamp, artifact, and SHA-256 |
| `GITHUB_SHA` or `VELO_BENCHMARK_REVISION` | Capture metadata                   | No                    | Prefer `GITHUB_SHA`; otherwise pin the exact commit                                                         |
| `VELO_BENCHMARK_DEPENDENCY_VERSIONS`      | Capture metadata                   | No                    | Pin explicitly; automatic Node/pnpm fallback is not enough for a full topology record                       |
| `VELO_BENCHMARK_TIMEOUT_MS`               | Optional runner default            | No                    | Positive integer; default `10000`                                                                           |
| `VELO_BENCHMARK_REPORT`                   | Optional gate/report default       | No                    | Final merged JSON path                                                                                      |
| `VELO_BENCHMARK_ALLOW_INSECURE_LOCALHOST` | Local conformance only             | No                    | `1` permits HTTP only for localhost; never use for qualification                                            |
| `NEXT_PUBLIC_VELO_BENCHMARK_MARKERS`      | Staging web build                  | No                    | Set exactly `true`; default is `false`                                                                      |

`VELO_BENCHMARK_PROFILE`, `VELO_BENCHMARK_TEMPERATURE`, and `VELO_BENCHMARK_WINDOW` are supported
for single-scenario operation. Qualification uses `--matrix --window`; profile and temperature are
selected from the locked contract. Do not pass `--concurrency` to a matrix run: normal requires 25
while growth requires 100, and one CLI override cannot satisfy both.

The baseline JSON value can be loaded from a protected reviewed file without printing it:

```bash
export VELO_BENCHMARK_BASELINE_JSON="$(< /secure/benchmark/approved-baseline.json)"
```

The file may not contain credentials, signer material, signed XDR, webhook payloads, or personal
wallet data.

## Controller conformance checklist

The HMAC request and cold-reset formats are defined in the
[architecture](../architecture/sprint-9-real-lifecycle-benchmark-architecture.md#controller-authentication-and-cold-reset-attestation).
Before using the runner, verify these response contracts outside the qualification windows:

| Paths                                                        | Required behavior                                                                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/payment-intent-create/setup`, `/payment-intent-list/setup` | Return authorization, real evidence mode, cohort/profile/temperature, fixture ID, cleanup token, and setup receipt                      |
| HTTP `/reset`                                                | Reset the declared cold state before one sample and return a sample-bound HMAC attestation                                              |
| HTTP `/cleanup`                                              | Consume the cleanup token and return capture/cohort-bound receipt                                                                       |
| Five control `/setup` paths                                  | Return authorization, cohort/profile/temperature, fixture ID, setup receipt, and valid clock provenance                                 |
| Five control `/prime` paths                                  | Warm-only real prime acknowledgement                                                                                                    |
| Five control `/execute` paths                                | Execute the real journey and return correlation ID, required lifecycle events/metrics, clock references, and cold attestation when cold |
| Five control `/cleanup` paths                                | Return capture/cohort-bound cleanup receipt                                                                                             |

The controller must use a real Chromium browser for checkout/UI measurement and a controlled wallet
for transaction submission. It must attach benchmark marker listeners before navigation. No
Playwright handler or controller endpoint is supplied by this repository; passing mocked adapter
tests is not controller conformance.

## Repository preflight

Run from the repository root with Node 18 or newer and pnpm 10.25.0:

```bash
pnpm install
pnpm benchmark:test
pnpm benchmark:gate:test
pnpm benchmark:smoke
```

`benchmark:smoke` is a no-network dry run of seven default cells. It validates the registry and
reports missing environment variables; it does not validate all 84 cells or call the controller.
Validate each 28-cell selection explicitly:

```bash
node scripts/benchmark.mjs --dry-run --matrix --window morning --out /tmp/sprint-9-morning-preflight.json
node scripts/benchmark.mjs --dry-run --matrix --window afternoon --out /tmp/sprint-9-afternoon-preflight.json
node scripts/benchmark.mjs --dry-run --matrix --window evening --out /tmp/sprint-9-evening-preflight.json
```

Review every `missingEnv` array. Dry-run output has `status: "suite_validated"`; it contains no
measurement and cannot support a performance claim.

## Plan the windows and storage

Use a new absolute directory in immutable-capable external storage. A matrix cell runs for at least
300 seconds. Twenty-eight sequential cells therefore need at least 140 minutes per window before
setup, per-sample cold resets, cleanup, and dependency delay. Leave enough margin for both capture
boundaries to stay in the required UTC range.

With the checked-in rates/durations, each window schedules at least:

- 3,000 attempts for each normal cell;
- 15,000 attempts for each growth cell; and
- 252,000 attempts across 28 cells before any operator-requested increase.

These are planned attempts, not successful-sample claims. Written authorization must cover the
full workload.

```bash
export EVIDENCE_ROOT="/absolute/external/velo-sprint-9"
install -d -m 700 "$EVIDENCE_ROOT/morning" "$EVIDENCE_ROOT/afternoon" "$EVIDENCE_ROOT/evening" "$EVIDENCE_ROOT/final"
```

Output JSON and NDJSON paths must not already exist. Each `--samples-out` path must be distinct and
inside the corresponding report directory.

## Capture three separate windows

Start and finish each command inside its named UTC boundary. Keep the same environment, cohort,
revision, baseline, and contributor values for all three commands. Keep at least 60 minutes between
the previous `completedAt` and the next `startedAt`.

```bash
node scripts/benchmark.mjs \
  --matrix --window morning \
  --out "$EVIDENCE_ROOT/morning/window.json" \
  --samples-out "$EVIDENCE_ROOT/morning/samples.ndjson"
```

```bash
node scripts/benchmark.mjs \
  --matrix --window afternoon \
  --out "$EVIDENCE_ROOT/afternoon/window.json" \
  --samples-out "$EVIDENCE_ROOT/afternoon/samples.ndjson"
```

```bash
node scripts/benchmark.mjs \
  --matrix --window evening \
  --out "$EVIDENCE_ROOT/evening/window.json" \
  --samples-out "$EVIDENCE_ROOT/evening/samples.ndjson"
```

Each successful command produces `status: "window_completed"`, one capture ID, 28 run summaries,
`startedAt`, `completedAt`, and an NDJSON SHA-256/record count. `window_completed` means only that a
window artifact was written. It is not a qualification verdict.

After each window, make the directory read-only or object-lock it, retain command output, and
independently record checksums:

```bash
sha256sum "$EVIDENCE_ROOT/morning/window.json" "$EVIDENCE_ROOT/morning/samples.ndjson"
sha256sum "$EVIDENCE_ROOT/afternoon/window.json" "$EVIDENCE_ROOT/afternoon/samples.ndjson"
sha256sum "$EVIDENCE_ROOT/evening/window.json" "$EVIDENCE_ROOT/evening/samples.ndjson"
```

Do not edit a source report to repair metadata. Correct the controller or environment and create a
new authorized capture with new immutable paths.

## Stream-merge and qualify

Merge the three windows. The merge reads and copies NDJSON as streams; it does not load all samples
into memory. It verifies source checksums/record counts and rejects an incomplete 28-cell window,
mixed identity, unsafe paths, or existing outputs.

```bash
pnpm benchmark:merge -- \
  --reports "$EVIDENCE_ROOT/morning/window.json,$EVIDENCE_ROOT/afternoon/window.json,$EVIDENCE_ROOT/evening/window.json" \
  --out "$EVIDENCE_ROOT/final/qualification.json" \
  --samples-out "$EVIDENCE_ROOT/final/qualification.ndjson"
```

Keep `VELO_BENCHMARK_CONTROL_SECRET` available while running the gate; it is required to reverify
every cold-reset HMAC from raw NDJSON.

```bash
pnpm benchmark:gate -- --report "$EVIDENCE_ROOT/final/qualification.json"
```

The gate prints JSON and exits nonzero on failure. It refuses CLI threshold overrides, so do not add
`--runs`, `--max-error-rate`, `--max-regression`, or `--slo`. Generate the human-readable projection
only after preserving the gate output:

```bash
pnpm benchmark:report -- \
  --report "$EVIDENCE_ROOT/final/qualification.json" \
  --out "$EVIDENCE_ROOT/final/qualification.md"
```

`benchmark:report` renders the captured summary; it does not run the qualification gate and must
not be treated as its verdict.

## Triage a failed capture or gate

| Failure                                             | Action                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Missing or invalid setup/cleanup receipt            | Reject the cell; inspect controller authorization/cohort binding                                |
| Invalid cold reset or gate says secret missing      | Reject the cell; verify sample binding, payload digest, HMAC secret/version, and nonce handling |
| Invalid HTTP outcome                                | Preserve the response correlation ID; fix staging API/controller data, not the evidence         |
| Lifecycle event/metric missing or duration mismatch | Inspect controller event mapping and clock provenance; never synthesize the missing boundary    |
| Client saturation or dropped arrival                | Reject the run; inspect runner host capacity and controller latency                             |
| Arrival or successful throughput below profile      | Reject the run; inspect runner capacity, rate limits, and Convex OCC behavior                   |
| Error rate at or above 0.5%                         | Reject the cell; retain all errors in the denominator                                           |
| Unattributed HTTP 503                               | Correlate authorized logs; an HTTP status alone does not prove a downstream outage              |
| Raw distribution differs from summary               | Treat as evidence-integrity failure; retain source artifacts and escalate                       |
| Window boundary/separation failure                  | Capture a new immutable window at an authorized time                                            |
| Baseline or contributor failure                     | Supply reviewed evidence; do not invent or reorder values to make the gate pass                 |

Never delete failed samples, rerun only selected failures, rewrite timestamps, reuse output paths, or
resubmit an unknown financial side effect to improve a benchmark.

## Evidence retention and handoff

Keep the complete final directory together because the gate resolves the NDJSON path relative to
the qualification report. Upload source windows, final artifacts, gate output, generated report,
authorization record, controller version/config digest, and independent checksums to immutable
access-controlled storage.

After capture, update only the compact tracked files:

- [`qualification-summary.json`](../../benchmarks/evidence/sprint-9/qualification-summary.json):
  status, gate verdict, matrix completeness, and approved decision; and
- [`evidence-manifest.json`](../../benchmarks/evidence/sprint-9/evidence-manifest.json): external
  URI, SHA-256, bytes, records, timestamps, and retention for every source/final artifact.

Do not add NDJSON or full reports to Git. Use `QUALIFIED` or “P0.1 passed” only when the locked gate
returns `pass`, every external artifact is retrievable and checksum-matched, and Product and
Architecture record approval. Otherwise preserve **CAPTURE PENDING**, **CAPTURED — VALIDATION
PENDING**, or **NOT QUALIFIED** with the exact reason.
