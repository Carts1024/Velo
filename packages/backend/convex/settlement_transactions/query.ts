import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";
import { requireProjectOwner } from "../projects/helpers";

export const listByProject = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const limit = args.limit ?? 50;

    return await ctx.db
      .query("settlementTransactions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);
  },
});

export const getByIdempotencyId = internalQuery({
  args: { idempotencyId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("settlementTransactions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyId", args.idempotencyId))
      .unique();
  },
});

export const getByOrderId = internalQuery({
  args: { orderId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("settlementTransactions")
      .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
      .unique();
  },
});

export const getByWithdrawalId = internalQuery({
  args: { withdrawalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("settlementTransactions")
      .withIndex("by_withdrawal_id", (q) => q.eq("withdrawalId", args.withdrawalId))
      .unique();
  },
});
