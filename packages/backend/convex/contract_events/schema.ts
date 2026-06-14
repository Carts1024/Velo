import { defineTable } from "convex/server";
import { v } from "convex/values";

export const pollerState = defineTable({
  scope: v.string(),
  projectId: v.optional(v.id("projects")),
  contractId: v.optional(v.string()),
  lastLedger: v.optional(v.number()),
  cursor: v.optional(v.string()),
  lastRunAt: v.optional(v.number()),
  status: v.union(v.literal("idle"), v.literal("polling"), v.literal("stale"), v.literal("error")),
  errorMessage: v.optional(v.string()),
  updatedAt: v.number(),
}).index("by_scope", ["scope"]);

export default defineTable({
  eventKey: v.string(),
  eventId: v.string(),
  projectId: v.id("projects"),
  contractId: v.string(),
  transactionHash: v.string(),
  ledger: v.number(),
  timestamp: v.optional(v.number()),
  topic: v.string(),
  topics: v.array(v.any()),
  type: v.string(),
  raw: v.any(),
  decoded: v.optional(v.any()),
  observedAt: v.number(),
})
  .index("by_event_key", ["eventKey"])
  .index("by_project_ledger", ["projectId", "ledger"])
  .index("by_contract_ledger", ["contractId", "ledger"])
  .index("by_transaction_hash", ["transactionHash"]);
