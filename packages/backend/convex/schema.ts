import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    website: v.optional(v.string()),
    metadataJson: v.string(),
    metadataHash: v.string(),
    ownerAddress: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("pending_registration"),
      v.literal("registered"),
      v.literal("registration_error"),
    ),
    registryProjectId: v.optional(v.number()),
    registrationTxHash: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerAddress"])
    .index("by_slug", ["slug"])
    .index("by_owner_status", ["ownerAddress", "status"]),
  tasks: defineTable({
    todo: v.string(),
    completed: v.boolean(),
    createdAt: v.number(), // Unix timestamp
    updatedAt: v.number(),
  }).index("by_completed", ["completed"]),
});
