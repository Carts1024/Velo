import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  scopeKey: v.string(),
  tokens: v.number(),
  updatedAt: v.number(),
}).index("by_scope_key", ["scopeKey"]);
