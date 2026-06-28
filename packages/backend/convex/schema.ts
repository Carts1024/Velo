import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import contractEvents from "./contract_events/schema";
import feedback from "./feedback/schema";
import pollerState from "./poller_state/schema";
import projectContracts from "./project_contracts/schema";
import projects from "./projects/schema";
import transactions from "./transactions/schema";
import users from "./users/schema";
import webhookDeliveries from "./webhook_deliveries/schema";
import webhookEndpoints from "./webhook_endpoints/schema";

export default defineSchema({
  contractEvents,
  feedback,
  pollerState,
  projectContracts,
  projects,
  transactions,
  users,
  webhookDeliveries,
  webhookEndpoints,
  tasks: defineTable({
    todo: v.string(),
    completed: v.boolean(),
    createdAt: v.number(), // Unix timestamp
    updatedAt: v.number(),
  }).index("by_completed", ["completed"]),
});
