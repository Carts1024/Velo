import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  url: v.string(),
  destinationHost: v.string(),
  enabled: v.boolean(),
  eventTypes: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_project", ["projectId"]);
