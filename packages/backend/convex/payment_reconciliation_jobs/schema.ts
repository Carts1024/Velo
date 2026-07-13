import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  paymentIntentId: v.id("paymentIntents"),
  projectId: v.id("projects"),
  txHash: v.optional(v.string()),
  state: v.union(v.literal("pending"), v.literal("leased"), v.literal("dead_letter")),
  attemptCount: v.number(),
  nextAttemptAt: v.number(),
  leaseToken: v.optional(v.string()),
  leaseGeneration: v.number(),
  leaseExpiresAt: v.optional(v.number()),
  expiresAt: v.number(),
  lastError: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_payment_intent", ["paymentIntentId"])
  .index("by_state_and_next_attempt_at", ["state", "nextAttemptAt"])
  .index("by_state_and_lease_expires_at", ["state", "leaseExpiresAt"]);
