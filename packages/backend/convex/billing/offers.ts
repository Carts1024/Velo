import { v } from "convex/values";

import type { MutationCtx, QueryCtx } from "../_generated/server";

import { mutation, query } from "../_generated/server";
import { requireBillingOperator } from "./access";
import { billingNetworkValidator } from "./schema";

function normalizeAmount(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,7})?$/.test(normalized) || Number(normalized) <= 0) {
    throw new Error("Offer price must be a positive Stellar amount");
  }
  return normalized;
}

export async function activeOffer(ctx: QueryCtx | MutationCtx, now = Date.now()) {
  const candidates = await ctx.db
    .query("billingOffers")
    .withIndex("by_active_and_active_from", (q) => q.eq("active", true).lte("activeFrom", now))
    .order("desc")
    .take(50);
  return (
    candidates.find((offer) => offer.activeUntil === undefined || offer.activeUntil > now) ?? null
  );
}

export const getActive = query({
  args: {},
  handler: async (ctx) => await activeOffer(ctx),
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireBillingOperator(ctx);
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)));
    return await ctx.db.query("billingOffers").order("desc").take(limit);
  },
});

export const create = mutation({
  args: {
    sku: v.string(),
    creditQuantity: v.int64(),
    priceAmount: v.string(),
    asset: v.string(),
    network: billingNetworkValidator,
    treasuryAddress: v.string(),
    activeFrom: v.number(),
    activeUntil: v.optional(v.number()),
    refundPolicy: v.string(),
    activate: v.boolean(),
  },
  handler: async (ctx, args) => {
    const operator = await requireBillingOperator(ctx);
    const sku = args.sku.trim();
    const asset = args.asset.trim().toUpperCase();
    const treasuryAddress = args.treasuryAddress.trim().toUpperCase();
    const refundPolicy = args.refundPolicy.trim();
    if (!sku || args.creditQuantity <= 0n || !asset || !treasuryAddress || !refundPolicy) {
      throw new Error("Offer fields are required");
    }
    if (args.network !== "testnet") {
      throw new Error("Sprint 2 billing offers are limited to Stellar Testnet");
    }
    if (!/^USDC:G[A-Z0-9]{3,}$/.test(asset)) {
      throw new Error("Offer asset must be an issued Testnet USDC asset");
    }
    if (!/^G[A-Z0-9]{3,}$/.test(treasuryAddress)) {
      throw new Error("Offer treasury must be a Stellar account");
    }
    if (args.activeUntil !== undefined && args.activeUntil <= args.activeFrom) {
      throw new Error("Offer activeUntil must follow activeFrom");
    }
    const prior = await ctx.db
      .query("billingOffers")
      .withIndex("by_sku_and_version", (q) => q.eq("sku", sku))
      .order("desc")
      .take(1);
    const version = (prior[0]?.version ?? 0) + 1;
    const now = Date.now();
    if (args.activate) {
      const active = await ctx.db
        .query("billingOffers")
        .withIndex("by_active_and_active_from", (q) => q.eq("active", true))
        .take(100);
      for (const offer of active) {
        await ctx.db.patch(offer._id, { active: false });
      }
    }
    return await ctx.db.insert("billingOffers", {
      sku,
      version,
      creditQuantity: args.creditQuantity,
      priceAmount: normalizeAmount(args.priceAmount),
      asset,
      network: args.network,
      treasuryAddress,
      refundPolicy,
      active: args.activate,
      activeFrom: args.activeFrom,
      ...(args.activeUntil === undefined ? {} : { activeUntil: args.activeUntil }),
      createdBy: operator.walletAddress,
      createdAt: now,
    });
  },
});
