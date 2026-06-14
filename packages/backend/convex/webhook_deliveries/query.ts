import { v } from "convex/values";

import { query } from "../_generated/server";
import { ownerProjectOrNull } from "../webhook_endpoints/helpers";
import { normalizeDeliveryLimit } from "./helpers";

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await ownerProjectOrNull(ctx, args.projectId, args.ownerAddress))) {
      return [];
    }

    return await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_project_created_at", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(normalizeDeliveryLimit(args.limit));
  },
});
