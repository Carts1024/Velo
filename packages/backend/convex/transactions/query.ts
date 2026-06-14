import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";
import { normalizeHash } from "./helpers";

export const getByHash = query({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const hash = normalizeHash(args.hash);
    return await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
  },
});

export const getCached = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
  },
});
