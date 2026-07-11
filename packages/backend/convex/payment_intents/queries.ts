import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";

import { internalQuery, query } from "../_generated/server";
import { projectOwnerOrNull } from "../projects/helpers";
import {
  verifyApiKeyForPayments,
  resolvePaymentAnchor,
  createPaymentIntentFingerprint,
} from "./helpers";

const paymentIntentStatusValidator = v.union(
  v.literal("created"),
  v.literal("pending"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("expired"),
  v.literal("cancelled"),
);

export const getPublicPaymentIntent = query({
  args: {
    apiKeyHash: v.string(),
    paymentIntentId: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await verifyApiKeyForPayments(ctx, args.apiKeyHash);
    if (!auth.authorized) {
      return { authorized: false as const, reason: auth.reason };
    }

    const normalizedId = ctx.db.normalizeId("paymentIntents", args.paymentIntentId);
    if (!normalizedId) {
      return { authorized: true as const, projectId: auth.project._id, intent: null };
    }

    const intent = await ctx.db.get(normalizedId);
    if (!intent || intent.projectId !== auth.project._id) {
      return { authorized: true as const, projectId: auth.project._id, intent: null };
    }

    return { authorized: true as const, projectId: auth.project._id, intent };
  },
});

export const listPublicPaymentIntents = query({
  args: {
    apiKeyHash: v.string(),
    status: v.optional(paymentIntentStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const auth = await verifyApiKeyForPayments(ctx, args.apiKeyHash);
    if (!auth.authorized) {
      return { authorized: false as const, reason: auth.reason };
    }

    const page = args.status
      ? await ctx.db
          .query("paymentIntents")
          .withIndex("by_project_status_created_at", (q) =>
            q.eq("projectId", auth.project._id).eq("status", args.status!),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("paymentIntents")
          .withIndex("by_project_created_at", (q) => q.eq("projectId", auth.project._id))
          .order("desc")
          .paginate(args.paginationOpts);

    return { authorized: true as const, projectId: auth.project._id, page };
  },
});

/**
 * Get a payment intent by ID. Public query — no auth required.
 * Used by the hosted checkout page to display payment details.
 */
export const getPaymentIntent = query({
  args: { paymentIntentId: v.id("paymentIntents") },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.paymentIntentId);
    if (!intent) {
      return null;
    }

    // Check if the intent has expired and update status inline if needed
    if (intent.status === "created" && Date.now() > intent.expiresAt) {
      return {
        ...intent,
        status: "expired" as const,
      };
    }

    return intent;
  },
});

/**
 * List payment intents for a project. Used in the merchant dashboard.
 * Requires the caller to be the project owner.
 */
export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await projectOwnerOrNull(ctx, args.projectId))) {
      return [];
    }

    const limit = Math.min(100, Math.max(1, args.limit ?? 20));
    return await ctx.db
      .query("paymentIntents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);
  },
});

function formatAsset(asset: string) {
  if (asset === "native" || asset === "XLM") return "XLM";
  const parts = asset.split(":");
  return parts[0] || asset;
}

/**
 * Aggregated telemetry and analytics metrics for a project dashboard.
 */
export const getProjectStats = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    if (!(await projectOwnerOrNull(ctx, args.projectId))) {
      return null;
    }

    // 1. Fetch all payment intents for this project
    const intents = await ctx.db
      .query("paymentIntents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const volumes: Record<string, number> = {};
    let paidCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let createdCount = 0;

    for (const intent of intents) {
      if (intent.status === "paid") {
        paidCount++;
        const assetLabel = formatAsset(intent.asset);
        const amountNum = parseFloat(intent.amount) || 0;
        volumes[assetLabel] = (volumes[assetLabel] || 0) + amountNum;
      } else if (intent.status === "pending") {
        pendingCount++;
      } else if (intent.status === "failed") {
        failedCount++;
      } else if (intent.status === "created") {
        createdCount++;
      }
    }

    // 2. Fetch all webhook deliveries for this project
    const webhookDeliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_project_created_at", (q) => q.eq("projectId", args.projectId))
      .collect();

    let successCount = 0;
    let totalLatency = 0;
    let latencyCount = 0;
    const totalDeliveries = webhookDeliveries.length;

    for (const delivery of webhookDeliveries) {
      if (delivery.status === "success") {
        successCount++;
      }
      if (delivery.responseTimeMs !== undefined) {
        totalLatency += delivery.responseTimeMs;
        latencyCount++;
      }
    }

    const successRate = totalDeliveries > 0 ? (successCount / totalDeliveries) * 100 : 100;
    const averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

    // 3. Take the 10 most recent payment intents for logging
    const recentPayments = intents.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);

    return {
      volumes: Object.entries(volumes).map(([asset, volume]) => ({ asset, volume })),
      counts: {
        total: intents.length,
        paid: paidCount,
        pending: pendingCount,
        failed: failedCount,
        created: createdCount,
      },
      webhooks: {
        totalDeliveries,
        successRate,
        averageLatency,
      },
      recentPayments,
    };
  },
});

export const resolveIntentRequest = internalQuery({
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

    const resolvedAnchor = resolvePaymentAnchor({
      requestedAnchor: args.anchor,
      apiKeyAnchor: auth.apiKey.paymentAnchor,
      projectDefaultAnchor: auth.project.defaultPaymentAnchor,
    });

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_project_provider", (q) =>
        q.eq("projectId", auth.project._id).eq("provider", "pdax"),
      )
      .unique();

    const hasPdaxConnection = connection ? connection.status === "connected" : false;

    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("paymentIntentIdempotencyKeys")
        .withIndex("by_project_and_key", (q) =>
          q.eq("projectId", auth.project._id).eq("key", args.idempotencyKey!),
        )
        .unique();

      if (existing) {
        const requestFingerprint = createPaymentIntentFingerprint(args);
        if (existing.requestFingerprint !== requestFingerprint) {
          return {
            authorized: true as const,
            status: "idempotency_conflict" as const,
            projectId: auth.project._id,
          };
        }

        const intent = await ctx.db.get(existing.paymentIntentId);
        if (intent && intent.projectId === auth.project._id) {
          return {
            authorized: true as const,
            status: "idempotency_replay" as const,
            projectId: auth.project._id,
            intent,
          };
        }
      }
    }

    return {
      authorized: true as const,
      status: "proceed" as const,
      resolvedAnchor,
      projectId: auth.project._id,
      ownerAddress: auth.project.ownerAddress,
      hasPdaxConnection,
    };
  },
});

/**
 * Internal query to fetch all paid PDAX payment intents for a given project.
 */
export const getPaidPdaxIntents = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("paymentIntents")
      .withIndex("by_project_status_created_at", (q) =>
        q.eq("projectId", args.projectId).eq("status", "paid"),
      )
      .collect();
  },
});

function lifecycleProjection(
  correlationId: string,
  intents: Doc<"paymentIntents">[],
  deliveries: Doc<"webhookDeliveries">[],
) {
  const paymentIntents = intents.map((intent) => ({
    id: intent._id,
    status: intent.status,
    transactionHash: intent.txHash ?? null,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  }));
  const webhookDeliveries = deliveries.map((delivery) => ({
    id: delivery._id,
    paymentIntentId: delivery.paymentIntentId ?? null,
    eventType: delivery.eventType,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    createdAt: delivery.createdAt,
    lastAttemptAt: delivery.lastAttemptAt,
    httpStatus: delivery.httpStatus ?? null,
    responseTimeMs: delivery.responseTimeMs ?? null,
  }));

  return {
    correlationId,
    paymentIntents,
    webhookDeliveries,
    stages: [
      ...paymentIntents.flatMap((intent) => [
        { name: "payment_intent.created", at: intent.createdAt, paymentIntentId: intent.id },
        {
          name: `payment_intent.${intent.status}`,
          at: intent.updatedAt,
          paymentIntentId: intent.id,
        },
      ]),
      ...webhookDeliveries.flatMap((delivery) => [
        { name: "webhook.queued", at: delivery.createdAt, deliveryId: delivery.id },
        { name: `webhook.${delivery.status}`, at: delivery.lastAttemptAt, deliveryId: delivery.id },
      ]),
    ].sort((left, right) => left.at - right.at),
  };
}

/**
 * Project-operator trace lookup. Ownership is verified before either indexed
 * read, so a correlation ID cannot enumerate another project's activity.
 */
export const getProjectPaymentLifecycleByCorrelation = query({
  args: {
    projectId: v.id("projects"),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await projectOwnerOrNull(ctx, args.projectId))) {
      return null;
    }

    const intents = await ctx.db
      .query("paymentIntents")
      .withIndex("by_project_and_correlation_id", (q) =>
        q.eq("projectId", args.projectId).eq("correlationId", args.correlationId),
      )
      .take(10);
    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_project_and_correlation_id_created_at", (q) =>
        q.eq("projectId", args.projectId).eq("correlationId", args.correlationId),
      )
      .order("asc")
      .take(100);

    return lifecycleProjection(args.correlationId, intents, deliveries);
  },
});

export const getPaymentIntentInternal = internalQuery({
  args: { paymentIntentId: v.id("paymentIntents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.paymentIntentId);
  },
});
