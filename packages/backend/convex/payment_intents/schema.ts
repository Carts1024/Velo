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
  expiresAt: v.number(), // Unix timestamp (createdAt + 30 mins)
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_status", ["status"]);
