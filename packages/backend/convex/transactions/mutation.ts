import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { normalizeCreatedAt } from "./helpers";

export const store = internalMutation({
  args: {
    hash: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("not_found"),
      v.literal("pending"),
      v.literal("unavailable"),
      v.literal("unsupported"),
    ),
    ledger: v.optional(v.number()),
    createdAt: v.optional(v.union(v.number(), v.string())),
    feeCharged: v.optional(v.string()),
    resultCode: v.optional(v.string()),
    operations: v.array(v.any()),
    contractCalls: v.array(v.any()),
    events: v.array(v.any()),
    failureReason: v.optional(v.string()),
    hint: v.optional(v.string()),
    rawResponse: v.string(),
  },
  handler: async (ctx, args) => {
    const createdAt = normalizeCreatedAt(args.createdAt);
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    const value = {
      ...args,
      createdAt,
      network: "testnet" as const,
      fetchedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }

    return await ctx.db.insert("transactions", value);
  },
});
