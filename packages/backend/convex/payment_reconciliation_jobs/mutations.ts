import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

const LEASE_MS = 8_500;
const JOB_TTL_MS = 30 * 60 * 1_000;
const MAX_PAGE_SIZE = 100;

export const ensure = internalMutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    projectId: v.id("projects"),
    txHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("paymentReconciliationJobs")
      .withIndex("by_payment_intent", (q) => q.eq("paymentIntentId", args.paymentIntentId))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("paymentReconciliationJobs", {
      ...args,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      leaseGeneration: 0,
      expiresAt: now + JOB_TTL_MS,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const claimDue = internalMutation({
  args: { leaseToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(0, Math.min(Math.floor(args.limit ?? MAX_PAGE_SIZE), MAX_PAGE_SIZE));
    if (limit === 0) return [];

    const now = Date.now();
    const due = await ctx.db
      .query("paymentReconciliationJobs")
      .withIndex("by_state_and_next_attempt_at", (q) =>
        q.eq("state", "pending").lte("nextAttemptAt", now),
      )
      .take(limit);
    const claimed = [];
    for (const job of due) {
      if (job.expiresAt <= now) {
        await ctx.db.patch(job._id, {
          state: "dead_letter",
          lastError: "Payment reconciliation budget exhausted",
          updatedAt: now,
        });
        continue;
      }
      const generation = job.leaseGeneration + 1;
      await ctx.db.patch(job._id, {
        state: "leased",
        leaseToken: args.leaseToken,
        leaseGeneration: generation,
        leaseExpiresAt: now + LEASE_MS,
        attemptCount: job.attemptCount + 1,
        updatedAt: now,
      });
      claimed.push({ ...job, leaseGeneration: generation });
    }
    return claimed;
  },
});

/**
 * Returns expired leases to the pending queue in a bounded transaction.
 * A subsequent claim increments leaseGeneration, fencing any stale worker that resumes.
 */
export const recoverExpiredLeases = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(0, Math.min(Math.floor(args.limit ?? MAX_PAGE_SIZE), MAX_PAGE_SIZE));
    if (limit === 0) {
      return { inspected: 0, recovered: 0, deadLettered: 0, saturated: false };
    }

    const now = Date.now();
    const expiredLeases = await ctx.db
      .query("paymentReconciliationJobs")
      .withIndex("by_state_and_lease_expires_at", (q) =>
        q.eq("state", "leased").lte("leaseExpiresAt", now),
      )
      .take(limit);

    let recovered = 0;
    let deadLettered = 0;
    for (const job of expiredLeases) {
      if (job.expiresAt <= now) {
        await ctx.db.patch(job._id, {
          state: "dead_letter",
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          lastError: "Payment reconciliation budget exhausted after lease expiry",
          updatedAt: now,
        });
        deadLettered++;
        continue;
      }

      await ctx.db.patch(job._id, {
        state: "pending",
        nextAttemptAt: now,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastError: "Expired reconciliation lease recovered",
        updatedAt: now,
      });
      recovered++;
    }

    return {
      inspected: expiredLeases.length,
      recovered,
      deadLettered,
      saturated: expiredLeases.length === limit,
    };
  },
});

export const finish = internalMutation({
  args: {
    jobId: v.id("paymentReconciliationJobs"),
    leaseToken: v.string(),
    leaseGeneration: v.number(),
    resolved: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.state !== "leased" ||
      job.leaseToken !== args.leaseToken ||
      job.leaseGeneration !== args.leaseGeneration
    )
      return false;
    if (args.resolved) {
      await ctx.db.delete(job._id);
    } else {
      await ctx.db.patch(job._id, {
        state: Date.now() >= job.expiresAt ? "dead_letter" : "pending",
        nextAttemptAt: Date.now() + Math.min(60_000, 1_000 * 2 ** Math.min(job.attemptCount, 6)),
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastError: args.errorMessage?.slice(0, 500),
        updatedAt: Date.now(),
      });
    }
    return true;
  },
});
