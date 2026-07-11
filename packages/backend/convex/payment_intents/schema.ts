import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  amount: v.string(),
  asset: v.string(), // e.g. "native" or "USDC:<issuer>"
  receiverAddress: v.string(),
  merchantName: v.string(),
  description: v.optional(v.string()),
  status: v.union(
    v.literal("created"),
    v.literal("pending"),
    v.literal("paid"),
    v.literal("failed"),
    v.literal("expired"),
    v.literal("cancelled"),
  ),
  payerAddress: v.optional(v.string()),
  txHash: v.optional(v.string()),
  successUrl: v.optional(v.string()),
  cancelUrl: v.optional(v.string()),
  anchor: v.optional(v.union(v.literal("inhouse"), v.literal("pdax"))),
  receiverMemo: v.optional(v.string()),
  anchorDepositCurrency: v.optional(v.string()),
  // Public request correlation, deliberately opaque and never derived from wallet data.
  correlationId: v.optional(v.string()),
  stageTimestamps: v.optional(
    v.object({
      created: v.number(),
      awaiting_signature: v.optional(v.number()),
      signed: v.optional(v.number()),
      submitted: v.optional(v.number()),
      confirmed: v.optional(v.number()),
      failed: v.optional(v.number()),
      cancelled: v.optional(v.number()),
      expired: v.optional(v.number()),
    }),
  ),
  expiresAt: v.number(), // Unix timestamp (createdAt + 30 mins)
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_project_created_at", ["projectId", "createdAt"])
  .index("by_project_status_created_at", ["projectId", "status", "createdAt"])
  .index("by_correlation_id", ["correlationId"])
  .index("by_project_and_correlation_id", ["projectId", "correlationId"])
  .index("by_status", ["status"]);
