import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

export const createPending = internalMutation({
  args: {
    projectId: v.id("projects"),
    endpointId: v.id("webhookEndpoints"),
    eventType: v.string(),
    destinationHost: v.string(),
    payloadSummary: v.any(),
    paymentIntentId: v.optional(v.id("paymentIntents")),
    correlationId: v.optional(v.string()),
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

export const startAttempt = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    attemptCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      attemptCount: args.attemptCount,
      lastAttemptAt: Date.now(),
    });
  },
});

export const logAttemptFailure = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    httpStatus: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    responseTimeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage?.slice(0, 500),
      responseTimeMs: args.responseTimeMs,
      lastAttemptAt: Date.now(),
    });
  },
});

export const scheduleRetry = internalMutation({
  args: {
    delaySeconds: v.number(),
    projectId: v.id("projects"),
    eventType: v.union(
      v.literal("contract.event"),
      v.literal("transaction.succeeded"),
      v.literal("transaction.failed"),
      v.literal("project.registered"),
      v.literal("project.updated"),
      v.literal("payment.created"),
      v.literal("payment.succeeded"),
      v.literal("payment.failed"),
      v.literal("payment_access.activated"),
      v.literal("settlement.quote.created"),
      v.literal("settlement.trade.executed"),
      v.literal("settlement.withdrawal.pending"),
      v.literal("settlement.withdrawal.succeeded"),
      v.literal("settlement.withdrawal.failed"),
      v.literal("provider.pdax.event.received"),
    ),
    contractEventId: v.optional(v.id("contractEvents")),
    paymentIntentId: v.optional(v.id("paymentIntents")),
    deliveryId: v.id("webhookDeliveries"),
    attemptCount: v.number(),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { delaySeconds, ...triggerArgs } = args;
    await ctx.scheduler.runAfter(
      delaySeconds * 1000,
      internal.webhookDelivery.trigger,
      triggerArgs,
    );
  },
});
