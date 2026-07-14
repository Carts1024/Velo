import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

import { mutation } from "../_generated/server";
import { recordMetric } from "../telemetry_outbox/helpers";

// One transactional bucket guarantees the advertised global capacity. Random
// shards reject early when traffic is uneven and can exceed capacity when each
// shard is independently full; Convex OCC retries serialize this bounded write.
const NUM_SHARDS = 1;

async function consumeBucket(
  ctx: MutationCtx,
  scopeKey: string,
  capacity: number,
  refillPerSecond: number,
  now: number,
) {
  // Pick a random shard so concurrent mutations hit different documents
  const shard = Math.floor(Math.random() * NUM_SHARDS);
  const shardKey = `${scopeKey}#${shard}`;
  const shardCapacity = capacity / NUM_SHARDS;
  const shardRefill = refillPerSecond / NUM_SHARDS;

  const bucket = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_scope_key", (q) => q.eq("scopeKey", shardKey))
    .unique();
  const available = bucket
    ? Math.min(shardCapacity, bucket.tokens + ((now - bucket.updatedAt) / 1_000) * shardRefill)
    : shardCapacity;
  const allowed = available >= 1;
  const tokens = allowed ? available - 1 : available;
  if (bucket) await ctx.db.patch(bucket._id, { tokens, updatedAt: now });
  else await ctx.db.insert("rateLimitBuckets", { scopeKey: shardKey, tokens, updatedAt: now });
  return {
    allowed,
    limit: capacity,
    remaining: Math.max(0, Math.floor(tokens * NUM_SHARDS)),
    retryAfterMs: allowed ? 0 : Math.ceil(((1 - available) / shardRefill) * 1_000),
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
  if (!apiKey.allowed || !project.allowed) {
    await recordMetric(ctx, "velo_rate_limit_total", "payment_rate_limit", "auth", "rejected");
  }
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
