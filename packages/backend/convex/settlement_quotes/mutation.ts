import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

export const create = internalMutation({
  args: {
    projectId: v.id("projects"),
    paymentIntentId: v.optional(v.id("payment_intents")),
    provider: v.literal("pdax"),
    quoteId: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    quoteCurrency: v.string(),
    baseCurrency: v.string(),
    quantity: v.string(),
    price: v.number(),
    totalAmount: v.number(),
    expiresAt: v.number(),
    status: v.union(v.literal("active"), v.literal("expired"), v.literal("executed")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("settlementQuotes", {
      projectId: args.projectId,
      paymentIntentId: args.paymentIntentId,
      provider: args.provider,
      quoteId: args.quoteId,
      side: args.side,
      quoteCurrency: args.quoteCurrency,
      baseCurrency: args.baseCurrency,
      quantity: args.quantity,
      price: args.price,
      totalAmount: args.totalAmount,
      expiresAt: args.expiresAt,
      status: args.status,
      createdAt: Date.now(),
    });
  },
});

export const updateStatus = internalMutation({
  args: {
    quoteId: v.string(),
    status: v.union(v.literal("active"), v.literal("expired"), v.literal("executed")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settlementQuotes")
      .withIndex("by_quote_id", (q) => q.eq("quoteId", args.quoteId))
      .unique();

    if (!existing) {
      throw new Error(`Quote not found: ${args.quoteId}`);
    }

    await ctx.db.patch(existing._id, { status: args.status });
    return existing._id;
  },
});
