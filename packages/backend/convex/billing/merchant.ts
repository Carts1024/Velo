import { v } from "convex/values";

import { query } from "../_generated/server";
import { findOrganizationForIdentity } from "../organizations/helpers";
import { isBillingOperator } from "./access";
import { emptyBalance } from "./helpers";
import { activeOffer } from "./offers";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const organization = await findOrganizationForIdentity(ctx, identity.tokenIdentifier);
    if (!organization) return null;
    const balance =
      (await ctx.db
        .query("billingBalances")
        .withIndex("by_organization_id_and_book", (q) =>
          q.eq("organizationId", organization._id).eq("book", "commercial"),
        )
        .unique()) ?? emptyBalance(organization._id, "commercial", Date.now());
    const topups = await ctx.db
      .query("billingTopups")
      .withIndex("by_organization_id_and_created_at", (q) =>
        q.eq("organizationId", organization._id),
      )
      .order("desc")
      .take(25);
    const receipts = await ctx.db
      .query("treasuryReceipts")
      .withIndex("by_organization_id_and_verified_at", (q) =>
        q.eq("organizationId", organization._id),
      )
      .order("desc")
      .take(25);
    const ledger = await ctx.db
      .query("billingLedgerEntries")
      .withIndex("by_organization_id_and_book", (q) =>
        q.eq("organizationId", organization._id).eq("book", "commercial"),
      )
      .order("desc")
      .take(50);
    const notifications = await ctx.db
      .query("billingNotifications")
      .withIndex("by_organization_id_and_created_at", (q) =>
        q.eq("organizationId", organization._id),
      )
      .order("desc")
      .take(25);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organization._id))
      .take(25);
    const pdaxCharges = [];
    for (const project of projects) {
      const settlements = await ctx.db
        .query("settlementTransactions")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .order("desc")
        .take(10);
      for (const settlement of settlements) {
        const quote = settlement.quoteId
          ? await ctx.db
              .query("settlementQuotes")
              .withIndex("by_quote_id", (q) => q.eq("quoteId", settlement.quoteId!))
              .unique()
          : null;
        const actualCost = settlement.withdrawalDetails?.fee ?? 0;
        const quotedCost = quote?.totalAmount ?? 0;
        pdaxCharges.push({
          settlementTransactionId: settlement._id,
          paymentIntentId: settlement.paymentIntentId,
          status: settlement.status,
          quotedCost,
          actualCost,
          spread:
            settlement.tradeDetails && quote
              ? settlement.tradeDetails.amount - quote.totalAmount
              : 0,
          subsidy: actualCost,
          currency: quote?.baseCurrency ?? "PHP",
          updatedAt: settlement.updatedAt,
        });
      }
    }
    return {
      organization,
      balance,
      activeOffer: await activeOffer(ctx),
      topups,
      receipts,
      ledger,
      notifications,
      pdaxCharges: pdaxCharges.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 25),
      isOperator: await isBillingOperator(ctx),
    };
  },
});

export const listLedger = query({
  args: { before: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const organization = await findOrganizationForIdentity(ctx, identity.tokenIdentifier);
    if (!organization) return [];
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)));
    const entries = await ctx.db
      .query("billingLedgerEntries")
      .withIndex("by_organization_id_and_book", (q) =>
        q.eq("organizationId", organization._id).eq("book", "commercial"),
      )
      .order("desc")
      .take(limit * 2);
    return entries.filter((entry) => entry.occurredAt < (args.before ?? Infinity)).slice(0, limit);
  },
});
