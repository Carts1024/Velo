import { v, ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { PAYMENT_INTENT_EXPIRY_MS, STATUS_TRANSITIONS } from "./helpers";

/**
 * Creates a new payment intent. Requires apiKeyHash for authentication.
 */
export const createPaymentIntent = mutation({
  args: {
    apiKeyHash: v.string(),
    amount: v.string(),
    asset: v.string(),
    description: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate using API key hash
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.apiKeyHash))
      .unique();

    if (!apiKey || apiKey.revoked) {
      throw new ConvexError("Unauthorized: Invalid API key.");
    }

    const project = await ctx.db.get(apiKey.projectId);
    if (!project) {
      throw new ConvexError("Unauthorized: Project not found.");
    }

    if (!project.paymentAccessActive) {
      throw new ConvexError("Unauthorized: Payment access is not activated for this project.");
    }

    const now = Date.now();

    // 2. Insert payment intent, using the project ownerAddress as the receiver for security
    const id = await ctx.db.insert("paymentIntents", {
      projectId: project._id,
      amount: args.amount,
      asset: args.asset,
      receiverAddress: project.ownerAddress,
      merchantName: project.name,
      ...(args.description !== undefined ? { description: args.description } : {}),
      status: "created",
      ...(args.successUrl !== undefined ? { successUrl: args.successUrl } : {}),
      ...(args.cancelUrl !== undefined ? { cancelUrl: args.cancelUrl } : {}),
      expiresAt: now + PAYMENT_INTENT_EXPIRY_MS,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Increment request count on the API key
    await ctx.db.patch(apiKey._id, {
      lastUsedAt: now,
      requestCount: apiKey.requestCount + 1,
    });

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: project._id,
      eventType: "payment.created",
      paymentIntentId: id,
    });

    return id;
  },
});

/**
 * Updates a payment intent's status with state machine validation.
 * Used by the checkout page to transition status.
 */
export const updateStatus = mutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    payerAddress: v.optional(v.string()),
    txHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found");
    }

    const now = Date.now();

    // Check expiry for non-terminal transitions
    if ((args.status === "pending" || args.status === "paid") && now > intent.expiresAt) {
      await ctx.db.patch(args.paymentIntentId, {
        status: "expired",
        updatedAt: now,
      });
      throw new ConvexError("Payment intent has expired");
    }

    // Validate state machine transition
    const allowedTransitions = STATUS_TRANSITIONS[intent.status];
    if (!allowedTransitions || !allowedTransitions.has(args.status)) {
      throw new ConvexError(`Invalid status transition: ${intent.status} → ${args.status}`);
    }

    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.payerAddress !== undefined) {
      patch.payerAddress = args.payerAddress;
    }

    if (args.txHash !== undefined) {
      patch.txHash = args.txHash;
    }

    await ctx.db.patch(args.paymentIntentId, patch);

    if (args.status === "paid") {
      await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
        projectId: intent.projectId,
        eventType: "payment.succeeded",
        paymentIntentId: args.paymentIntentId,
      });
    } else if (args.status === "failed") {
      await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
        projectId: intent.projectId,
        eventType: "payment.failed",
        paymentIntentId: args.paymentIntentId,
      });
    }
  },
});
