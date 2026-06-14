import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";
import { ownerProjectOrNull, requireOwnerProject, validateWebhookUrl } from "./helpers";

export const getSettings = query({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await ownerProjectOrNull(ctx, args.projectId, args.ownerAddress))) {
      return null;
    }

    return await ctx.db
      .query("webhookEndpoints")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
  },
});

export const getSummary = query({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await ownerProjectOrNull(ctx, args.projectId, args.ownerAddress))) {
      return null;
    }

    const endpoint = await ctx.db
      .query("webhookEndpoints")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_project_created_at", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(20);
    const successes = deliveries.filter((delivery) => delivery.status === "success").length;

    return {
      configured: Boolean(endpoint),
      enabled: endpoint?.enabled ?? false,
      destinationHost: endpoint?.destinationHost,
      eventTypeCount: endpoint?.eventTypes.length ?? 0,
      lastDelivery: deliveries[0] ?? null,
      recentCount: deliveries.length,
      successCount: successes,
      failedCount: deliveries.filter((delivery) => delivery.status === "failed").length,
    };
  },
});

export const getDeliveryTarget = internalQuery({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
    eventType: v.string(),
    contractEventId: v.optional(v.id("contractEvents")),
  },
  handler: async (ctx, args) => {
    const project = await requireOwnerProject(ctx, args.projectId, args.ownerAddress);
    const endpoint = await ctx.db
      .query("webhookEndpoints")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();

    if (!endpoint) {
      throw new Error("Save a webhook endpoint before sending a test event");
    }

    if (!endpoint.enabled) {
      throw new Error("Enable the webhook endpoint before sending");
    }

    if (!endpoint.eventTypes.includes(args.eventType)) {
      throw new Error(`${args.eventType} is not enabled for this endpoint`);
    }

    validateWebhookUrl(endpoint.url);

    const contractEvent = args.contractEventId ? await ctx.db.get(args.contractEventId) : undefined;

    if (contractEvent && contractEvent.projectId !== args.projectId) {
      throw new Error("Observed event does not belong to this project");
    }

    return { endpoint, project, contractEvent };
  },
});
