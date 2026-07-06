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

export const getById = internalQuery({
  args: { id: v.id("settlementTransactions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByAnyIdentifier = internalQuery({
  args: { identifier: v.string() },
  handler: async (ctx, args) => {
    // 1. Try matching by idempotencyId
    let tx = await ctx.db
      .query("settlementTransactions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyId", args.identifier))
      .unique();
    if (tx) return tx;

    // 2. Try matching by withdrawalId
    tx = await ctx.db
      .query("settlementTransactions")
      .withIndex("by_withdrawal_id", (q) => q.eq("withdrawalId", args.identifier))
      .unique();
    if (tx) return tx;

    // 3. Try matching by orderId (if identifier is numeric)
    const numericId = Number(args.identifier);
    if (Number.isInteger(numericId)) {
      tx = await ctx.db
        .query("settlementTransactions")
        .withIndex("by_order_id", (q) => q.eq("orderId", numericId))
        .unique();
      if (tx) return tx;
    }

    return null;
  },
});

export const listAllPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Scan all settlement transactions and filter for PAYOUT_PENDING.
    // No status index exists, but volume is low enough for a full scan.
    const all = await ctx.db.query("settlementTransactions").order("desc").take(200);
    return all.filter((tx) => tx.status === "PAYOUT_PENDING").slice(0, 50);
  },
});
