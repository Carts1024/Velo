import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  hash: v.string(),
  network: v.literal("testnet"),
  status: v.union(
    v.literal("success"),
    v.literal("failed"),
    v.literal("not_found"),
    v.literal("pending"),
    v.literal("unavailable"),
    v.literal("unsupported"),
  ),
  ledger: v.optional(v.number()),
  createdAt: v.optional(v.number()),
  feeCharged: v.optional(v.string()),
  resultCode: v.optional(v.string()),
  operations: v.array(v.any()),
  contractCalls: v.array(v.any()),
  events: v.array(v.any()),
  failureReason: v.optional(v.string()),
  hint: v.optional(v.string()),
  rawResponse: v.string(),
  fetchedAt: v.number(),
}).index("by_hash", ["hash"]);
