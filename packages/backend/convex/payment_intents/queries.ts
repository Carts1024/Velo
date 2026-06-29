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
