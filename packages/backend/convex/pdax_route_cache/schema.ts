import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  mappedAsset: v.string(),
  address: v.string(),
  memo: v.optional(v.string()),
  expiresAt: v.number(),
  updatedAt: v.number(),
}).index("by_project_and_mapped_asset", ["projectId", "mappedAsset"]);
