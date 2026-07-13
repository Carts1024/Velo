import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  endpointId: v.id("webhookEndpoints"),
  eventType: v.string(),
  destinationHost: v.string(),
  payloadSummary: v.any(),
  status: v.union(v.literal("pending"), v.literal("success"), v.literal("failed")),
  // `failed` is retained for API compatibility; deadLetter makes terminal quarantine explicit.
  deadLetter: v.optional(v.boolean()),
  deadLetterAt: v.optional(v.number()),
  replayedAt: v.optional(v.number()),
  httpStatus: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  attemptCount: v.number(),
  lastAttemptAt: v.number(),
  createdAt: v.number(),
  paymentIntentId: v.optional(v.id("paymentIntents")),
  correlationId: v.optional(v.string()),
  responseTimeMs: v.optional(v.number()),
  nextAttemptAt: v.optional(v.number()),
  deliveryKey: v.optional(v.string()),
  schemaVersion: v.optional(v.string()),
  leaseToken: v.optional(v.string()),
  leaseGeneration: v.optional(v.number()),
  leaseExpiresAt: v.optional(v.number()),
})
  .index("by_project_created_at", ["projectId", "createdAt"])
  .index("by_endpoint_created_at", ["endpointId", "createdAt"])
  .index("by_correlation_id_created_at", ["correlationId", "createdAt"])
  .index("by_project_and_correlation_id_created_at", ["projectId", "correlationId", "createdAt"])
  .index("by_delivery_key", ["deliveryKey"]);
