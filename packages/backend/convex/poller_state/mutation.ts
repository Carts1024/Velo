import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { projectScope } from "./helpers";

export const markPolling = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const scope = projectScope(args.projectId);
    const existing = await ctx.db
      .query("pollerState")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .unique();
    const value = {
      scope,
      projectId: args.projectId,
      status: "polling" as const,
      errorMessage: undefined,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
      return;
    }

    await ctx.db.insert("pollerState", value);
  },
});

export const markError = internalMutation({
  args: {
    projectId: v.id("projects"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = projectScope(args.projectId);
    const existing = await ctx.db
      .query("pollerState")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .unique();
    const now = Date.now();
    const value = {
      scope,
      projectId: args.projectId,
      status: "error" as const,
      lastRunAt: now,
      errorMessage: args.message.slice(0, 500),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
    } else {
      await ctx.db.insert("pollerState", value);
    }
  },
});
