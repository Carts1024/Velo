import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

import { mutation } from "../_generated/server";

async function consumeBucket(
  ctx: MutationCtx,
  scopeKey: string,
  capacity: number,
  refillPerSecond: number,
  now: number,
) {
  const bucket = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
    .unique();
  const available = bucket
    ? Math.min(capacity, bucket.tokens + ((now - bucket.updatedAt) / 1_000) * refillPerSecond)
    : capacity;
  const allowed = available >= 1;
  const tokens = allowed ? available - 1 : available;
  if (bucket) await ctx.db.patch(bucket._id, { tokens, updatedAt: now });
  else await ctx.db.insert("rateLimitBuckets", { scopeKey, tokens, updatedAt: now });
  return {
    allowed,
    limit: capacity,
    remaining: Math.max(0, Math.floor(tokens)),
    retryAfterMs: allowed ? 0 : Math.ceil(((1 - available) / refillPerSecond) * 1_000),
  };
}

export async function consumePaymentRateLimits(
  ctx: MutationCtx,
  apiKeyHash: string,
  projectId: Id<"projects">,
) {
  const now = Date.now();
  const apiKey = await consumeBucket(ctx, `api:${apiKeyHash}`, 200, 60, now);
  const project = await consumeBucket(ctx, `project:${projectId}`, 300, 100, now);
  return {
    allowed: apiKey.allowed && project.allowed,
    limit: Math.min(apiKey.limit, project.limit),
    remaining: Math.min(apiKey.remaining, project.remaining),
    retryAfterMs: Math.max(apiKey.retryAfterMs, project.retryAfterMs),
  };
}

// REST get/list routes call this transactional mutation before their read query.
export const consume = mutation({
  args: { apiKeyHash: v.string() },
  handler: async (ctx, args) => {
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.apiKeyHash))
      .unique();
    if (!apiKey || apiKey.revoked) return { authorized: false as const };
    return {
      authorized: true as const,
      ...(await consumePaymentRateLimits(ctx, args.apiKeyHash, apiKey.projectId)),
    };
  },
});
