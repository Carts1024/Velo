import { v } from "convex/values";

import { query } from "../_generated/server";
import { ownerProjectOrNull } from "../projects/helpers";

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await ownerProjectOrNull(ctx, args.projectId, args.ownerAddress))) {
      return [];
    }

    return await ctx.db
      .query("projectContracts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(100);
  },
});
