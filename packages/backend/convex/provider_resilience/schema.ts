import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  provider: v.literal("pdax"),
  consecutiveFailures: v.number(),
  circuitOpenUntil: v.optional(v.number()),
  leaseToken: v.optional(v.string()),
  leaseExpiresAt: v.optional(v.number()),
  updatedAt: v.number(),
}).index("by_project_and_provider", ["projectId", "provider"]);
