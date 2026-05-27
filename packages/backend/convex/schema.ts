import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    todo: v.string(),
    completed: v.boolean(),
    createdAt: v.number(), // Unix timestamp
    updatedAt: v.number(),
  }).index("by_completed", ["completed"]),
});
