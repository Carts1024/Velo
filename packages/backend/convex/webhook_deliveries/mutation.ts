import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

export const createPending = internalMutation({
  args: {
    projectId: v.id("projects"),
    endpointId: v.id("webhookEndpoints"),
    eventType: v.string(),
    destinationHost: v.string(),
    payloadSummary: v.any(),
    paymentIntentId: v.optional(v.id("paymentIntents")),
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

export const finish = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    status: v.union(v.literal("success"), v.literal("failed")),
    httpStatus: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    responseTimeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      status: args.status,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage?.slice(0, 500),
      responseTimeMs: args.responseTimeMs,
      lastAttemptAt: Date.now(),
    });
  },
});
