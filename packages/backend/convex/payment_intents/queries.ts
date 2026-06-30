import { v } from "convex/values";

import { query } from "../_generated/server";

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
    ownerAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerAddress !== args.ownerAddress.trim().toUpperCase()) {
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
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerAddress !== args.ownerAddress.trim().toUpperCase()) {
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
