import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";

export const createPending = internalMutation({
  args: {
    projectId: v.id("projects"),
    endpointId: v.id("webhookEndpoints"),
    eventType: v.string(),
    destinationHost: v.string(),
    payloadSummary: v.any(),
    paymentIntentId: v.optional(v.id("paymentIntents")),
    correlationId: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("webhookDeliveries", {
      ...args,
      status: "pending",
      attemptCount: 1,
      lastAttemptAt: now,
      createdAt: now,
      deadLetter: false,
      ...("nextAttemptAt" in args && args.nextAttemptAt !== undefined
        ? { nextAttemptAt: args.nextAttemptAt }
        : {}),
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
    deadLetter: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      status: args.status,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage?.slice(0, 500),
      responseTimeMs: args.responseTimeMs,
      lastAttemptAt: Date.now(),
      ...(args.deadLetter ? { deadLetter: true, deadLetterAt: Date.now() } : {}),
    });
  },
});

export const startAttempt = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    attemptCount: v.number(),
    nextAttemptAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      attemptCount: args.attemptCount,
      lastAttemptAt: Date.now(),
      ...(args.nextAttemptAt !== undefined ? { nextAttemptAt: args.nextAttemptAt } : {}),
    });
  },
});

export const logAttemptFailure = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    httpStatus: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    responseTimeMs: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage?.slice(0, 500),
      responseTimeMs: args.responseTimeMs,
      lastAttemptAt: Date.now(),
      ...(args.nextAttemptAt !== undefined ? { nextAttemptAt: args.nextAttemptAt } : {}),
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
    settlementQuoteId: v.optional(v.id("settlementQuotes")),
    settlementTransactionId: v.optional(v.id("settlementTransactions")),
    providerEventId: v.optional(v.id("providerEvents")),
    deliveryId: v.id("webhookDeliveries"),
    attemptCount: v.number(),
    correlationId: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { delaySeconds, ...triggerArgs } = args;
    await ctx.scheduler.runAfter(delaySeconds * 1000, internal.webhookDelivery.trigger, {
      ...triggerArgs,
      nextAttemptAt: args.nextAttemptAt,
    });
  },
});

export const replay = mutation({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Webhook delivery not found");
    const project = await ctx.db.get(delivery.projectId);
    if (
      !project ||
      (project.ownerTokenIdentifier !== identity.tokenIdentifier && project.ownerAddress !== identity.subject)
    ) {
      throw new Error("Not authorized to replay this delivery");
    }
    await ctx.db.patch(args.deliveryId, {
      status: "pending",
      deadLetter: false,
      nextAttemptAt: Date.now(),
      replayedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: delivery.projectId,
      eventType: delivery.eventType as
        | "contract.event"
        | "transaction.succeeded"
        | "transaction.failed"
        | "project.registered"
        | "project.updated"
        | "payment.created"
        | "payment.succeeded"
        | "payment.failed"
        | "payment_access.activated"
        | "settlement.quote.created"
        | "settlement.trade.executed"
        | "settlement.withdrawal.pending"
        | "settlement.withdrawal.succeeded"
        | "settlement.withdrawal.failed"
        | "provider.pdax.event.received",
      paymentIntentId: delivery.paymentIntentId,
      deliveryId: delivery._id,
      attemptCount: delivery.attemptCount + 1,
      correlationId: delivery.correlationId,
    });
    return { deliveryId: delivery._id };
  },
});
