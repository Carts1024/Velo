import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import projects from "./projects/schema";
import webhookDeliveries from "./webhook_deliveries/schema";
import webhookEndpoints from "./webhook_endpoints/schema";

export default defineSchema({
  projects,
  webhookDeliveries,
  webhookEndpoints,
  projectContracts: defineTable({
    projectId: v.id("projects"),
    ownerAddress: v.string(),
    registryProjectId: v.number(),
    contractId: v.string(),
    status: v.union(
      v.literal("pending_add"),
      v.literal("active"),
      v.literal("pending_remove"),
      v.literal("contract_error"),
      v.literal("stale"),
    ),
    addTxHash: v.optional(v.string()),
    removeTxHash: v.optional(v.string()),
    error: v.optional(v.string()),
    confirmedLedger: v.optional(v.number()),
    lastSyncAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_contract", ["projectId", "contractId"])
    .index("by_owner", ["ownerAddress"])
    .index("by_status", ["status"]),
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
  contractEvents: defineTable({
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
    .index("by_transaction_hash", ["transactionHash"]),
  pollerState: defineTable({
    scope: v.string(),
    projectId: v.optional(v.id("projects")),
    contractId: v.optional(v.string()),
    lastLedger: v.optional(v.number()),
    cursor: v.optional(v.string()),
    lastRunAt: v.optional(v.number()),
    status: v.union(
      v.literal("idle"),
      v.literal("polling"),
      v.literal("stale"),
      v.literal("error"),
    ),
    errorMessage: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_scope", ["scope"]),
  tasks: defineTable({
    todo: v.string(),
    completed: v.boolean(),
    createdAt: v.number(), // Unix timestamp
    updatedAt: v.number(),
  }).index("by_completed", ["completed"]),
});
