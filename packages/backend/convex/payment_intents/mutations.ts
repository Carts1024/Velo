import { v, ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";
import {
  createPaymentIntentFingerprint,
  PAYMENT_INTENT_EXPIRY_MS,
  STATUS_TRANSITIONS,
  resolvePaymentAnchor,
  verifyApiKeyForPayments,
} from "./helpers";

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
    anchor: v.optional(v.union(v.literal("inhouse"), v.literal("pdax"))),
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

    // Resolve payment anchor
    const resolvedAnchor = resolvePaymentAnchor({
      requestedAnchor: args.anchor,
      apiKeyAnchor: apiKey.paymentAnchor,
      projectDefaultAnchor: project.defaultPaymentAnchor,
    });

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
      anchor: resolvedAnchor,
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

    return { paymentIntentId: id, projectId: project._id };
  },
});

/**
 * Creates a payment intent for SDK-facing REST routes.
 * Auth and project scope are derived from the API key hash.
 */
export const createPublicPaymentIntent = mutation({
  args: {
    apiKeyHash: v.string(),
    amount: v.string(),
    asset: v.string(),
    description: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    anchor: v.optional(v.union(v.literal("inhouse"), v.literal("pdax"))),
  },
  handler: async (ctx, args) => {
    const auth = await verifyApiKeyForPayments(ctx, args.apiKeyHash);
    if (!auth.authorized) {
      return { authorized: false as const, reason: auth.reason };
    }

    const now = Date.now();
    const requestFingerprint = createPaymentIntentFingerprint(args);

    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("paymentIntentIdempotencyKeys")
        .withIndex("by_project_and_key", (q) =>
          q.eq("projectId", auth.project._id).eq("key", args.idempotencyKey!),
        )
        .unique();

      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          return {
            authorized: true as const,
            idempotencyConflict: true as const,
            projectId: auth.project._id,
          };
        }

        const intent = await ctx.db.get(existing.paymentIntentId);
        if (intent && intent.projectId === auth.project._id) {
          await ctx.db.patch(auth.apiKeyId, {
            lastUsedAt: now,
            requestCount: auth.apiKey.requestCount + 1,
          });
          return {
            authorized: true as const,
            idempotencyReplay: true as const,
            projectId: auth.project._id,
            intent,
          };
        }
      }
    }

    // Resolve payment anchor
    const resolvedAnchor = resolvePaymentAnchor({
      requestedAnchor: args.anchor,
      apiKeyAnchor: auth.apiKey.paymentAnchor,
      projectDefaultAnchor: auth.project.defaultPaymentAnchor,
    });

    const paymentIntentId = await ctx.db.insert("paymentIntents", {
      projectId: auth.project._id,
      amount: args.amount,
      asset: args.asset,
      receiverAddress: auth.project.ownerAddress,
      merchantName: auth.project.name,
      ...(args.description !== undefined ? { description: args.description } : {}),
      status: "created",
      ...(args.successUrl !== undefined ? { successUrl: args.successUrl } : {}),
      ...(args.cancelUrl !== undefined ? { cancelUrl: args.cancelUrl } : {}),
      anchor: resolvedAnchor,
      expiresAt: now + PAYMENT_INTENT_EXPIRY_MS,
      createdAt: now,
      updatedAt: now,
    });

    if (args.idempotencyKey !== undefined) {
      await ctx.db.insert("paymentIntentIdempotencyKeys", {
        projectId: auth.project._id,
        key: args.idempotencyKey,
        requestFingerprint,
        paymentIntentId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(auth.apiKeyId, {
      lastUsedAt: now,
      requestCount: auth.apiKey.requestCount + 1,
    });

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: auth.project._id,
      eventType: "payment.created",
      paymentIntentId,
    });

    const intent = await ctx.db.get(paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found after creation");
    }

    return {
      authorized: true as const,
      idempotencyReplay: false as const,
      projectId: auth.project._id,
      intent,
    };
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
    if (args.status === "paid") {
      throw new ConvexError("Public mutation cannot mark payment intent paid");
    }

    const intent = await ctx.db.get(args.paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found");
    }

    const now = Date.now();

    // Check expiry for non-terminal transitions
    if (args.status === "pending" && now > intent.expiresAt) {
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

    if (args.status === "failed") {
      await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
        projectId: intent.projectId,
        eventType: "payment.failed",
        paymentIntentId: args.paymentIntentId,
      });
    }
  },
});

/**
 * Marks a payment intent paid after backend ledger verification.
 * This is intentionally internal so clients cannot equate Horizon submission with settlement.
 */
export const markVerifiedPaid = internalMutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    txHash: v.string(),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found");
    }

    const now = Date.now();
    if (now > intent.expiresAt) {
      await ctx.db.patch(args.paymentIntentId, {
        status: "expired",
        updatedAt: now,
      });
      throw new ConvexError("Payment intent has expired");
    }

    if (intent.status !== "pending") {
      throw new ConvexError(`Invalid verified paid transition: ${intent.status} -> paid`);
    }

    await ctx.db.patch(args.paymentIntentId, {
      status: "paid",
      txHash: args.txHash,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: intent.projectId,
      eventType: "payment.succeeded",
      paymentIntentId: args.paymentIntentId,
    });
  },
});

export const insertPublicPaymentIntentV2 = internalMutation({
  args: {
    apiKeyHash: v.string(),
    amount: v.string(),
    asset: v.string(),
    description: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    anchor: v.union(v.literal("inhouse"), v.literal("pdax")),
    receiverAddress: v.string(),
    receiverMemo: v.optional(v.string()),
    anchorDepositCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await verifyApiKeyForPayments(ctx, args.apiKeyHash);
    if (!auth.authorized) {
      throw new ConvexError(auth.reason || "Unauthorized");
    }

    const now = Date.now();

    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("paymentIntentIdempotencyKeys")
        .withIndex("by_project_and_key", (q) =>
          q.eq("projectId", auth.project._id).eq("key", args.idempotencyKey!),
        )
        .unique();

      if (existing) {
        throw new ConvexError("Idempotency conflict or replay detected");
      }
    }

    const paymentIntentId = await ctx.db.insert("paymentIntents", {
      projectId: auth.project._id,
      amount: args.amount,
      asset: args.asset,
      receiverAddress: args.receiverAddress,
      merchantName: auth.project.name,
      ...(args.description !== undefined ? { description: args.description } : {}),
      status: "created",
      ...(args.successUrl !== undefined ? { successUrl: args.successUrl } : {}),
      ...(args.cancelUrl !== undefined ? { cancelUrl: args.cancelUrl } : {}),
      anchor: args.anchor,
      receiverMemo: args.receiverMemo,
      anchorDepositCurrency: args.anchorDepositCurrency,
      expiresAt: now + PAYMENT_INTENT_EXPIRY_MS,
      createdAt: now,
      updatedAt: now,
    });

    if (args.idempotencyKey !== undefined) {
      const requestFingerprint = createPaymentIntentFingerprint({
        amount: args.amount,
        asset: args.asset,
        description: args.description,
        successUrl: args.successUrl,
        cancelUrl: args.cancelUrl,
        anchor: args.anchor,
      });

      await ctx.db.insert("paymentIntentIdempotencyKeys", {
        projectId: auth.project._id,
        key: args.idempotencyKey,
        requestFingerprint,
        paymentIntentId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(auth.apiKeyId, {
      lastUsedAt: now,
      requestCount: auth.apiKey.requestCount + 1,
    });

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: auth.project._id,
      eventType: "payment.created",
      paymentIntentId,
    });

    const intent = await ctx.db.get(paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found after creation");
    }

    return intent;
  },
});
