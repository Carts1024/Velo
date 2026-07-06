import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  provider: v.literal("pdax"),
  status: v.union(v.literal("connected"), v.literal("disconnected")),
  username: v.optional(v.string()),
  accessToken: v.optional(v.string()),
  idToken: v.optional(v.string()),
  refreshToken: v.optional(v.string()),
  tokenExpiresAt: v.optional(v.number()), // Unix epoch ms
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_project_provider", ["projectId", "provider"]);
