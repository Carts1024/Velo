import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  paymentIntentId: v.id("paymentIntents"),
  projectId: v.id("projects"),
  mappedAsset: v.string(),
  state: v.union(
    v.literal("scheduled"),
    v.literal("leased"),
    v.literal("retry_wait"),
    v.literal("succeeded"),
    v.literal("failed"),
  ),
  attempts: v.number(),
  nextAttemptAt: v.number(),
  leaseToken: v.optional(v.string()),
  leaseExpiresAt: v.optional(v.number()),
  lastErrorCode: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_payment_intent", ["paymentIntentId"])
  .index("by_state_and_next_attempt_at", ["state", "nextAttemptAt"]);
