import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireOwnerProject, validateEventTypes, validateWebhookUrl } from "./helpers";

export const saveSettings = mutation({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
    url: v.string(),
    enabled: v.boolean(),
    eventTypes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwnerProject(ctx, args.projectId, args.ownerAddress);
    const normalizedUrl = validateWebhookUrl(args.url);
    const eventTypes = validateEventTypes(args.eventTypes);
    const existing = await ctx.db
      .query("webhookEndpoints")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    const now = Date.now();
    const value = {
      projectId: args.projectId,
      ...normalizedUrl,
      enabled: args.enabled,
      eventTypes,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }

    return await ctx.db.insert("webhookEndpoints", {
      ...value,
      createdAt: now,
    });
  },
});
