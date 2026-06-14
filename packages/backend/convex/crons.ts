import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "poll recent contract events",
  { minutes: 1 },
  internal.contractEventPolling.pollScheduled,
  {},
);

export default crons;
