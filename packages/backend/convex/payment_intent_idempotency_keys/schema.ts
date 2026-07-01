import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  key: v.string(),
  requestFingerprint: v.string(),
  paymentIntentId: v.id("paymentIntents"),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_project_and_key", ["projectId", "key"]);
