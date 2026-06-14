import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import contractEvents, { pollerState } from "./contract_events/schema";
import projectContracts from "./project_contracts/schema";
import projects from "./projects/schema";
import webhookDeliveries from "./webhook_deliveries/schema";
import webhookEndpoints from "./webhook_endpoints/schema";

export default defineSchema({
  contractEvents,
  pollerState,
  projectContracts,
  projects,
  webhookDeliveries,
  webhookEndpoints,
  transactions: defineTable({
    hash: v.string(),
    network: v.literal("testnet"),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("not_found"),
      v.literal("pending"),
      v.literal("unavailable"),
      v.literal("unsupported"),
    ),
    ledger: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    feeCharged: v.optional(v.string()),
    resultCode: v.optional(v.string()),
    operations: v.array(v.any()),
    contractCalls: v.array(v.any()),
    events: v.array(v.any()),
    failureReason: v.optional(v.string()),
    hint: v.optional(v.string()),
    rawResponse: v.string(),
    fetchedAt: v.number(),
  }).index("by_hash", ["hash"]),
  tasks: defineTable({
    todo: v.string(),
    completed: v.boolean(),
    createdAt: v.number(), // Unix timestamp
    updatedAt: v.number(),
  }).index("by_completed", ["completed"]),
});
