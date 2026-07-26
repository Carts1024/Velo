import { v } from "convex/values";

import { internalMutation, mutation, query } from "../_generated/server";
import {
  authenticatedWallet,
  isBillingOperator,
  normalizeWalletAddress,
  requireBillingOperator,
} from "./access";

export const bootstrap = internalMutation({
  args: {
    walletAddress: v.string(),
    actor: v.string(),
  },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query("billingOperatorWallets")
      .filter((q) => q.eq(q.field("active"), true))
      .take(1);
    if (active.length > 0) throw new Error("Billing operator bootstrap is already complete");
    const walletAddress = normalizeWalletAddress(args.walletAddress);
    const actor = args.actor.trim();
    if (!actor) throw new Error("Bootstrap actor is required");
    const now = Date.now();
    return await ctx.db.insert("billingOperatorWallets", {
      walletAddress,
      active: true,
      createdBy: actor,
      createdAt: now,
      updatedBy: actor,
      updatedAt: now,
    });
  },
});

export const getAccess = query({
  args: {},
  handler: async (ctx) => {
    const walletAddress = await authenticatedWallet(ctx);
    return { walletAddress, isOperator: await isBillingOperator(ctx) };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireBillingOperator(ctx);
    return await ctx.db.query("billingOperatorWallets").order("desc").take(100);
  },
});

export const setOperator = mutation({
  args: {
    walletAddress: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const operator = await requireBillingOperator(ctx);
    const walletAddress = normalizeWalletAddress(args.walletAddress);
    const existing = await ctx.db
      .query("billingOperatorWallets")
      .withIndex("by_wallet_address", (q) => q.eq("walletAddress", walletAddress))
      .unique();

    if (!args.active && walletAddress === operator.walletAddress) {
      const activeOperators = await ctx.db
        .query("billingOperatorWallets")
        .filter((q) => q.eq(q.field("active"), true))
        .take(2);
      if (activeOperators.length === 1) {
        throw new Error("Cannot remove the final active operator");
      }
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        active: args.active,
        updatedBy: operator.walletAddress,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("billingOperatorWallets", {
      walletAddress,
      active: args.active,
      createdBy: operator.walletAddress,
      createdAt: now,
      updatedBy: operator.walletAddress,
      updatedAt: now,
    });
  },
});
