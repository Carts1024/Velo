import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

export const WEBHOOK_EVENT_TYPES = [
  "contract.event",
  "transaction.succeeded",
  "transaction.failed",
  "project.registered",
  "project.updated",
] as const;

const DEFAULT_DELIVERY_LIMIT = 25;
const MAX_DELIVERY_LIMIT = 100;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeOwnerAddress(address: string) {
  return address.trim().toUpperCase();
}

function validateEventTypes(eventTypes: string[]) {
  const unique = Array.from(new Set(eventTypes));

  if (unique.length === 0) {
    throw new Error("Select at least one webhook event type");
  }

  for (const eventType of unique) {
    if (!WEBHOOK_EVENT_TYPES.includes(eventType as (typeof WEBHOOK_EVENT_TYPES)[number])) {
      throw new Error(`Unsupported webhook event type: ${eventType}`);
    }
  }

  return unique;
}

function validateWebhookUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid webhook URL");
  }

  if (LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      "Webhook delivery runs from hosted Convex and cannot reach localhost. Use a deployed HTTPS endpoint or an HTTPS tunnel.",
    );
  }

  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
  }

  if (url.username || url.password) {
    throw new Error("Webhook URL cannot include embedded credentials");
  }

  return {
    url: url.toString(),
    destinationHost: url.host,
  };
}

async function requireOwnerProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  ownerAddress: string,
) {
  const project = await ctx.db.get(projectId);

  if (!project) {
    throw new Error("Project not found");
  }

  if (project.ownerAddress !== normalizeOwnerAddress(ownerAddress)) {
    throw new Error("Connected wallet does not own this project");
  }

  return project;
}

async function ownerProjectOrNull(ctx: QueryCtx, projectId: Id<"projects">, ownerAddress: string) {
  const project = await ctx.db.get(projectId);

  if (!project || project.ownerAddress !== normalizeOwnerAddress(ownerAddress)) {
    return null;
  }

  return project;
}

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

export const listDeliveries = query({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await ownerProjectOrNull(ctx, args.projectId, args.ownerAddress))) {
      return [];
    }
    const limit = Math.min(MAX_DELIVERY_LIMIT, Math.max(1, args.limit ?? DEFAULT_DELIVERY_LIMIT));

    return await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_project_created_at", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);
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
