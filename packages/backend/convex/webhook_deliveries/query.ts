import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";
import { ownerProjectOrNull } from "../webhook_endpoints/helpers";
import { normalizeDeliveryLimit } from "./helpers";

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await ownerProjectOrNull(ctx, args.projectId))) {
      return [];
    }

    return await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_project_created_at", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(normalizeDeliveryLimit(args.limit));
  },
});

export const getDelivery = internalQuery({
  args: {
    deliveryId: v.id("webhookDeliveries"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.deliveryId);
  },
});
