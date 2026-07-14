import { cronJobs, makeFunctionReference } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();
const drainPaymentReconciliation = makeFunctionReference<"action">(
  "payment_reconciliation_jobs/actions:drain",
);
const reconcileProviderOperations = makeFunctionReference<"action">(
  "provider_operations/actions:reconcileDue",
);
const drainProviderEvents = makeFunctionReference<"action">("provider_events/processing:drain");
const recoverPdaxRouteJobs = makeFunctionReference<"mutation">(
  "payment_intents/mutations:recoverPdaxRouteJobs",
);
const exportTelemetry = makeFunctionReference<"action">("telemetry_outbox/actions:exportBatch");
const expireTelemetry = makeFunctionReference<"mutation">("telemetry_outbox/mutations:expire");
const captureTelemetryGauges = makeFunctionReference<"mutation">("telemetry_outbox/gauges:capture");
const expireJourneyStages = makeFunctionReference<"mutation">("journey_stages/mutations:expire");

crons.interval(
  "poll recent contract events",
  { minutes: 1 },
  internal.contractEventPolling.pollScheduled,
  {},
);

crons.interval("export bounded telemetry outbox", { minutes: 1 }, exportTelemetry, { limit: 100 });
crons.interval("expire telemetry diagnostics", { hours: 1 }, expireTelemetry, { limit: 100 });
crons.interval("capture bounded telemetry gauges", { minutes: 1 }, captureTelemetryGauges, {});
crons.interval("expire safe journey stages", { hours: 1 }, expireJourneyStages, { limit: 100 });

crons.interval("drain payment reconciliation jobs", { minutes: 1 }, drainPaymentReconciliation, {
  limit: 100,
});

crons.interval(
  "reconcile durable provider operations",
  { minutes: 1 },
  reconcileProviderOperations,
  { limit: 100 },
);

crons.interval("recover and drain provider events", { minutes: 1 }, drainProviderEvents, {
  limit: 100,
});

crons.interval("recover PDAX payment routes", { minutes: 1 }, recoverPdaxRouteJobs, {
  limit: 100,
});

crons.interval(
  "poll pay access events",
  { minutes: 1 },
  internal.payAccessSync.syncPayAccessEvents,
  {},
);

crons.interval(
  "poll pending payout status from PDAX",
  { minutes: 2 },
  internal.settlement.actions.pollPendingPayouts,
  {},
);

export default crons;
