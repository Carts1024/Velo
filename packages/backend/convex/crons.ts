import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "poll recent contract events",
  { minutes: 1 },
  internal.contractEventPolling.pollScheduled,
  {},
);

crons.interval(
  "poll pay access events",
  { minutes: 1 },
  internal.payAccessSync.syncPayAccessEvents,
  {},
);

crons.interval(
  "poll pending payment intents",
  { minutes: 1 },
  internal.payment_intents.scanner.checkPendingPayments,
  {},
);

crons.interval(
  "poll pending payout status from PDAX",
  { minutes: 2 },
  internal.settlement.actions.pollPendingPayouts,
  {},
);

export default crons;
