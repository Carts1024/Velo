import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";
import { requireProjectOwner } from "../projects/helpers";

// Public query: returns connection status, strips sensitive tokens
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Ensure the user owns the project
    await requireProjectOwner(ctx, args.projectId);

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_project_provider", (q) =>
        q.eq("projectId", args.projectId).eq("provider", "pdax"),
      )
      .unique();

    if (!connection) return null;

    // Strip sensitive tokens
    const {
      accessToken: _accessToken,
      idToken: _idToken,
      refreshToken: _refreshToken,
      ...publicConnection
    } = connection;
    return publicConnection;
  },
});

// Internal query: returns the full connection with tokens for internal backend operations
export const getInternal = internalQuery({
  args: { projectId: v.id("projects"), provider: v.literal("pdax") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("providerConnections")
      .withIndex("by_project_provider", (q) =>
        q.eq("projectId", args.projectId).eq("provider", args.provider),
      )
      .unique();
  },
});
