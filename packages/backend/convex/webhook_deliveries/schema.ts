import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  endpointId: v.id("webhookEndpoints"),
  eventType: v.string(),
  destinationHost: v.string(),
  payloadSummary: v.any(),
  status: v.union(v.literal("pending"), v.literal("success"), v.literal("failed")),
  httpStatus: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  attemptCount: v.number(),
  lastAttemptAt: v.number(),
  createdAt: v.number(),
})
  .index("by_project_created_at", ["projectId", "createdAt"])
  .index("by_endpoint_created_at", ["endpointId", "createdAt"]);
