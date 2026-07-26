import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { emptyBalance } from "./helpers";
import { billingBookValidator } from "./schema";

export const reconcile = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    book: billingBookValidator,
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("billingLedgerEntries")
      .withIndex("by_organization_id_and_book", (q) =>
        q.eq("organizationId", args.organizationId).eq("book", args.book),
      )
      .take(4_096);
    const projected = emptyBalance(args.organizationId, args.book, 0);

    for (const entry of entries) {
      const prefix = entry.creditClass === "promotional" ? "promo" : "paid";
      if (entry.entryType === "promo_grant" || entry.entryType === "paid_grant") {
        projected[`${prefix}Available`] += entry.amount;
      } else if (entry.entryType === "reserve") {
        projected[`${prefix}Available`] -= entry.amount;
        projected[`${prefix}Reserved`] += entry.amount;
      } else if (entry.entryType === "consume") {
        projected[`${prefix}Reserved`] -= entry.amount;
        projected[`${prefix}Consumed`] += entry.amount;
      } else if (entry.entryType === "release") {
        projected[`${prefix}Reserved`] -= entry.amount;
        projected[`${prefix}Available`] += entry.amount;
      } else if (entry.entryType === "expiry") {
        projected[`${prefix}Available`] -= entry.amount;
        projected[`${prefix}Expired`] += entry.amount;
      } else {
        projected[`${prefix}Available`] += entry.amount;
      }
    }

    const materialized =
      (await ctx.db
        .query("billingBalances")
        .withIndex("by_organization_id_and_book", (q) =>
          q.eq("organizationId", args.organizationId).eq("book", args.book),
        )
        .unique()) ?? emptyBalance(args.organizationId, args.book, 0);
    const lots = await ctx.db
      .query("creditLots")
      .withIndex("by_organization_id_and_book_and_credit_class", (q) =>
        q.eq("organizationId", args.organizationId).eq("book", args.book),
      )
      .take(4_096);
    const lotProjection = emptyBalance(args.organizationId, args.book, 0);
    for (const lot of lots) {
      const prefix = lot.creditClass === "promotional" ? "promo" : "paid";
      lotProjection[`${prefix}Available`] += lot.available;
      lotProjection[`${prefix}Reserved`] += lot.reserved;
      lotProjection[`${prefix}Consumed`] += lot.consumed;
      lotProjection[`${prefix}Expired`] += lot.expired;
    }
    const fields = [
      "promoAvailable",
      "promoReserved",
      "promoConsumed",
      "promoExpired",
      "paidAvailable",
      "paidReserved",
      "paidConsumed",
      "paidExpired",
    ] as const;
    const ledgerMatches = fields.every((field) => materialized[field] === projected[field]);
    const lotsMatch = fields.every((field) => materialized[field] === lotProjection[field]);
    return {
      matches: ledgerMatches && lotsMatch,
      ledgerMatches,
      lotsMatch,
      truncated: entries.length === 4_096 || lots.length === 4_096,
      entryCount: entries.length,
      lotCount: lots.length,
      projected,
      lotProjection,
      materialized,
    };
  },
});

export const listShadowDecisions = internalQuery({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)));
    return await ctx.db
      .query("shadowBillingDecisions")
      .withIndex("by_project_id_and_created_at", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);
  },
});
