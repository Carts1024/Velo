import { v } from "convex/values";

import { internalMutation, mutation } from "../_generated/server";
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

export const createPendingDelivery = internalMutation({
  args: {
    projectId: v.id("projects"),
    endpointId: v.id("webhookEndpoints"),
    eventType: v.string(),
    destinationHost: v.string(),
    payloadSummary: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("webhookDeliveries", {
      ...args,
      status: "pending",
      attemptCount: 1,
      lastAttemptAt: now,
      createdAt: now,
    });
  },
});

export const finishDelivery = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    status: v.union(v.literal("success"), v.literal("failed")),
    httpStatus: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      status: args.status,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage?.slice(0, 500),
      lastAttemptAt: Date.now(),
    });
  },
});
