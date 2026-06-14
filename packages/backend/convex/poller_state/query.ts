import type { QueryCtx } from "../_generated/server";
import type { ProjectId } from "../projects/types";

import { projectScope } from "./helpers";

export async function pollerForProject(ctx: QueryCtx, projectId: ProjectId) {
  return await ctx.db
    .query("pollerState")
    .withIndex("by_scope", (q) => q.eq("scope", projectScope(projectId)))
    .unique();
}
