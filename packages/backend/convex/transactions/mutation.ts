import { v } from "convex/values";

import { internalMutation, mutation } from "../_generated/server";
import { normalizeCreatedAt } from "./helpers";

export const store = internalMutation({
  args: {
    hash: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("not_found"),
      v.literal("pending"),
      v.literal("submitted"),
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

export const reportSubmitted = mutation({
  args: {
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    const now = Date.now();
    const value = {
      hash: args.hash,
      status: "submitted" as const,
      network: "testnet" as const,
      fetchedAt: now,
      rawResponse: JSON.stringify({ status: "submitted" }),
      operations: [],
      contractCalls: [],
      events: [],
    };

    if (existing) {
      // Only transition if not already in a terminal state
      if (existing.status !== "success" && existing.status !== "failed") {
        await ctx.db.patch(existing._id, value);
      }
      return existing._id;
    }

    return await ctx.db.insert("transactions", value);
  },
});
