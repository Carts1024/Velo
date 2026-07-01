import { v } from "convex/values";

import { query } from "../_generated/server";
import { normalizeAddress, requireIdentity } from "../projects/helpers";

export const getByWallet = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const tokenFeedback = await ctx.db
      .query("feedback")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (tokenFeedback) {
      return tokenFeedback;
    }

    const walletAddress = normalizeAddress(identity.subject);

    return await ctx.db
      .query("feedback")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .unique();
  },
});

export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, args.limit ?? 50));

    return await ctx.db.query("feedback").order("desc").take(limit);
  },
});
