import { v } from "convex/values";

import { query } from "../_generated/server";
import { normalizeAddress } from "../projects/helpers";

export const getByWallet = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const walletAddress = normalizeAddress(args.walletAddress);

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
