import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
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
  .index("by_status", ["status"]);
