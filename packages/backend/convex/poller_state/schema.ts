import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  scope: v.string(),
  projectId: v.optional(v.id("projects")),
  contractId: v.optional(v.string()),
  lastLedger: v.optional(v.number()),
  cursor: v.optional(v.string()),
  lastRunAt: v.optional(v.number()),
  status: v.union(v.literal("idle"), v.literal("polling"), v.literal("stale"), v.literal("error")),
  errorMessage: v.optional(v.string()),
  ledgerLag: v.optional(v.number()),
  timeLagMs: v.optional(v.number()),
  updatedAt: v.number(),
}).index("by_scope", ["scope"]);
