# Sprint 10 Observability and Redaction Runbook

Status: **IMPLEMENTED — LIVE EVIDENCE PENDING**

Use this runbook to start the local stack, find one payment journey, respond to Sprint 10 alerts, and complete the deployed redaction migration. Live synthetic reconstruction and telemetry overhead qualification remain pending until authorized staging captures exist.

## Start and validate the local stack

From the repository root:

```bash
docker compose -f observability/docker-compose.yml config
docker compose -f observability/docker-compose.yml up -d
```

Configure the web and Convex server environments to send OTLP/HTTP to the collector:

| Variable                                | Applies to       | Default or requirement                                                                         |
| --------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `VELO_OTEL_ENABLED`                     | Web, server only | Set `true` to export. Otherwise telemetry export is disabled.                                  |
| `VELO_OTEL_EXPORTER_OTLP_ENDPOINT`      | Web and Convex   | Local host default is `http://localhost:4318`; Convex requires an explicit reachable endpoint. |
| `VELO_OTEL_EXPORTER_OTLP_AUTHORIZATION` | Web and Convex   | Optional complete authorization header value. Never expose it to the browser.                  |
| `VELO_OTEL_SUCCESS_SAMPLE_RATIO`        | Web              | Defaults to `0.1`, clamped to `0..1`. Convex success sampling is fixed at `0.1`.               |
| `VELO_OTEL_SERVICE_NAME`                | Web              | Defaults to `velo-web`.                                                                        |
| `VELO_RELEASE_VERSION`                  | Web              | Defaults to `development`.                                                                     |
| `VELO_UI_TELEMETRY_INTAKE_SECRET`       | Web and Convex   | Required for durable UI marker intake; keep server-side.                                       |
| `VELO_TELEMETRY_CONSOLE`                | Web              | Optional `true` for projected safe console events.                                             |

The Next.js instrumentation hook also maps standard `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME`, and `OTEL_RESOURCE_ATTRIBUTES` values when present.

Open Grafana at `http://localhost:3001` and select the provisioned dashboard with UID `velo-sprint-10`. Prometheus, Tempo, and Loki are internal Compose services; Grafana has provisioned data sources for each.

Stop the stack with:

```bash
docker compose -f observability/docker-compose.yml down
```

## Find a journey by correlation

1. Capture `X-Correlation-Id` from the current API response.
2. For a payment-intent create or replay, capture the durable `correlationId` response field or `X-Velo-Journey-Id`. Do not substitute the replay request ID for the durable journey ID.
3. In an authenticated project-owner surface, invoke `payment_intents.queries.getProjectPaymentLifecycleByCorrelation` with the owned `projectId` and durable `correlationId`.
4. Inspect `traceIdentifiers.traceparents`, the ordered `stages`, `webhookDeliveries`, and `missingStages`.
5. Use the trace ID from the W3C `traceparent` in Tempo. Use the journey correlation only as a log/trace attribute; never turn it into a metric label.

The query returns `null` before reading journey data when the caller does not own the project. It reads at most 10 payment intents, 100 webhook deliveries, and 100 additional journey stages.

Expected complete journey diagnostics are `payment_intent.created`, `payment_intent.submitted`, `payment_intent.observed`, `payment_intent.confirmed`, `webhook.acknowledged`, and `ui.rendered`. A missing UI stage is not evidence that payment failed; browser measurements are untrusted and may be unavailable.

## Alert response

### Correlation coverage

Alert: `VeloCorrelationCoverageLow`  
Owner: `API/Web`  
Condition: successful responses returning correlation fall below `99.9%` over 15 minutes, held for 15 minutes.

1. Query the dashboard by route `operation` and compare `velo_correlation_return_total` with `velo_success_total`.
2. Confirm the route is one of the 16 filesystem-derived methods protected by `withRouteTelemetry`.
3. Reproduce both a success and a handled error; verify `X-Correlation-Id` and compatibility `X-Request-Id`.
4. If only a deployment revision is affected, roll back that revision. Do not disable response correlation to reduce telemetry load.

### Error rate

Alert: `VeloErrorRateHigh`  
Owner: `API/Web`  
Condition: errors are at least `0.5%` of requests over 5 minutes, held for 5 minutes.

1. Group `velo_error_total` by its emitted `service`, `operation`, and `outcome` labels.
2. Join a failing request to Tempo with its correlation and trace ID, then inspect the span's catalogued stage, dependency, and stable error code where present.
3. Check provider, queue, webhook, and exporter panels before attributing the fault.
4. Treat arbitrary exception text as sensitive. Record only a stable error code and allowlisted summary in incident notes.

### Scenario latency

Alert: `VeloScenarioP95High`  
Owner: `Payments Backend`  
Condition: recorded `velo_journey_p95_seconds` exceeds `velo_locked_slo_p95_seconds` for 10 minutes.

The seven locked operations are `payment-intent-create`, `payment-intent-list`, `checkout-preparation`, `transaction-submission`, `confirmation-detection`, `ui-propagation`, and `webhook-delivery`. The values are hardcoded in seconds and an asset test requires an exact match with `benchmarks/manifest.json`; they must not be edited to clear an alert.

1. Identify the operation in the alert series.
2. Compare dependency, queue, confirmation, webhook, and UI panels for the same window.
3. Inspect representative sampled traces; errors and timeouts should be present even when success sampling omits some journeys.
4. Separate server latency from untrusted UI latency before assigning a financial-path incident.

### Telemetry exporter

Alert: `VeloTelemetryDeadLetters`  
Owner: `Payments Backend`  
Condition: `velo_telemetry_dead_letters > 0` for one minute.

1. Check `VELO_OTEL_EXPORTER_OTLP_ENDPOINT` reachability and authorization in the Convex environment.
2. Confirm Collector `/v1/traces` and `/v1/metrics` are available.
3. Inspect only outbox state, attempt count, next attempt, and stable error code. Do not copy financial records into diagnostics.
4. Repair the exporter or collector. The current implementation provides dead-letter visibility but no unrestricted public redrive; use a reviewed internal recovery mutation if a redrive is added.
5. Remember that exported rows are deleted immediately and expired rows are removed after 14 days.

An exporter incident is not, by itself, a payment incident. Export failures cannot roll back business mutations.

### Provider health

Alert: `VeloProviderUnhealthy`  
Owner: `Settlement/PDAX`  
Condition: `velo_provider_healthy == 0` for two minutes, representing two one-minute evaluations.

1. Check provider circuit state and `velo_provider_event_backlog`.
2. Inspect sampled `provider_auth` and `provider_call` dependency spans.
3. Confirm that new provider callbacks contain typed summaries and digests, not raw payloads.
4. Follow existing PDAX recovery rules. Never resubmit an ambiguous financial operation merely to improve telemetry.

### Queue backlog

Alert: `VeloQueueStalled`  
Owner: `Webhooks/Integrations`  
Condition: queue depth is over one 100-row processing batch and oldest work is over 120 seconds, held for two minutes.

1. Compare `velo_queue_depth`, `velo_queue_oldest_seconds`, `velo_scanner_backlog`, and `velo_webhook_backlog`.
2. Confirm one-minute exporter, reconciliation, provider-event, and route-recovery jobs are running.
3. Inspect expired leases and next-attempt timestamps before manual recovery.
4. Preserve lease fencing. A stale worker must not complete work claimed by a newer generation.

## Redaction deployment

Do not narrow the schema in the same deployment that introduces safe summaries.

### 1. Widen

Deploy the additive schema with `eventSummary`, `responseSummary`, `errorCode`, digests, and telemetry context. Confirm new provider ingress does not populate `rawEvent`.

### 2. Migrate

Run bounded pages from an authorized operator context, carrying both returned cursors until `eventsDone` and `operationsDone` are true:

```bash
pnpm --filter @repo/backend exec convex run telemetry_outbox/redactionMigration:normalizeLegacyDiagnostics '{"limit":100}'
```

Subsequent calls must provide the returned `eventCursor` and `operationCursor`. Re-running a page is safe: rows already summarized are skipped.

### 3. Verify

Scan both tables in bounded pages, carrying both cursors until `isDone` is true:

```bash
pnpm --filter @repo/backend exec convex run telemetry_outbox/redactionMigration:verifyNoLegacyDiagnostics '{"limit":100}'
```

Do not proceed unless the accumulated `providerEvents` and `providerOperations` forbidden-row counts are both zero.

### 4. Narrow

In a later deployment, remove legacy `rawEvent`, `resultJson`, and `errorMessage` fields and their dual-read behavior. Preserve operational request fields still required to reconcile ambiguous provider operations under their current authorization boundary.

## Validation commands

```bash
pnpm --filter @repo/observability test
pnpm --filter web test
pnpm --filter @repo/backend test
pnpm --filter @repo/pdax test
pnpm --filter @repo/stellar test
pnpm --filter @carts1024/velo-sdk test
node --test scripts/telemetry-overhead-gate.test.mjs scripts/observability-assets.test.mjs
pnpm --filter web build
git diff --check
```

The overhead test validates gate mathematics and capture-shape rules only. It requires three alternating disabled/enabled pairs for both normal and warm profiles, at least 1,000 successful samples per arm, matching revision/cohort/payload metadata, and `(enabled p95 - disabled p95) / disabled p95 < 0.03`. A passing unit test is not a live overhead verdict.

## Retention and evidence handling

- Traces and sanitized logs: 14 days.
- Metrics: 90 days.
- Telemetry dead-letter envelopes and journey stages: 14 days.
- Raw traces and benchmark captures: external only.
- Repository evidence: compact manifests, deterministic tests, and truthful reports.

See the [architecture](../architecture/sprint-10-end-to-end-observability-and-redaction.md) and [Sprint 10 evidence report](../references/sprint-10-observability-redaction-and-overhead-report.md).
