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

crons.interval(
  "poll recent contract events",
  { minutes: 1 },
  internal.contractEventPolling.pollScheduled,
  {},
);

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
