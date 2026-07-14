import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

export const expire = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("journeyStages")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(Math.min(args.limit ?? 100, 100));
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
