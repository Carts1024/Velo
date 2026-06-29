import type { QueryCtx } from "../_generated/server";

/**
 * Validates an API key hash and returns the associated project if authorized.
 * Checks that the key exists, is not revoked, and the project has payment access active.
 */
export async function verifyApiKeyForPayments(ctx: QueryCtx, apiKeyHash: string) {
  const apiKey = await ctx.db
    .query("apiKeys")
    .withIndex("by_key_hash", (q) => q.eq("keyHash", apiKeyHash))
    .unique();

  if (!apiKey || apiKey.revoked) {
    return { authorized: false as const };
  }

  const project = await ctx.db.get(apiKey.projectId);
  if (!project) {
    return { authorized: false as const };
  }

  if (!project.paymentAccessActive) {
    return { authorized: false as const, reason: "Payment access not activated" };
  }

  return {
    authorized: true as const,
    project,
    apiKeyId: apiKey._id,
  };
}

/** Default payment intent expiry: 30 minutes in milliseconds. */
export const PAYMENT_INTENT_EXPIRY_MS = 30 * 60 * 1000;

/**
 * Valid status transitions for payment intents.
 * Key = current status, Value = set of allowed next statuses.
 */
export const STATUS_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  created: new Set(["pending", "expired", "cancelled", "failed"]),
  pending: new Set(["paid", "failed", "expired", "cancelled"]),
  failed: new Set(["pending", "paid", "expired", "cancelled"]),
};
