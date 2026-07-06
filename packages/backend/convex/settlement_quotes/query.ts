import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";
import { requireProjectOwner } from "../projects/helpers";

export const getByQuoteId = internalQuery({
  args: { quoteId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("settlementQuotes")
      .withIndex("by_quote_id", (q) => q.eq("quoteId", args.quoteId))
      .unique();
  },
});

export const getById = internalQuery({
  args: { id: v.id("settlementQuotes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const limit = args.limit ?? 50;

    return await ctx.db
      .query("settlementQuotes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);
  },
});
