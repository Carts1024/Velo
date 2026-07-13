import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";
import { normalizeCreatedAt } from "./helpers";

export const store = internalMutation({
  args: {
    hash: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("not_found"),
      v.literal("pending"),
      v.literal("submitted"),
      v.literal("unavailable"),
      v.literal("unsupported"),
    ),
    ledger: v.optional(v.number()),
    createdAt: v.optional(v.union(v.number(), v.string())),
    feeCharged: v.optional(v.string()),
    resultCode: v.optional(v.string()),
    operations: v.array(v.any()),
    contractCalls: v.array(v.any()),
    events: v.array(v.any()),
    failureReason: v.optional(v.string()),
    hint: v.optional(v.string()),
    rawResponse: v.string(),
  },
  handler: async (ctx, args) => {
    const createdAt = normalizeCreatedAt(args.createdAt);
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    const value = {
      ...args,
      createdAt,
      network: "testnet" as const,
      fetchedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }

    return await ctx.db.insert("transactions", value);
  },
});

export const reportSubmitted = mutation({
  args: {
    hash: v.string(),
    paymentIntentId: v.optional(v.id("paymentIntents")),
    payerAddress: v.optional(v.string()),
    stageTimestamps: v.optional(
      v.object({
        startedSigning: v.number(),
        signed: v.number(),
        submitted: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    const now = Date.now();
    const value = {
      hash: args.hash,
      status: "submitted" as const,
      network: "testnet" as const,
      fetchedAt: now,
      rawResponse: JSON.stringify({ status: "submitted" }),
      operations: [],
      contractCalls: [],
      events: [],
    };

    let txId;
    if (existing) {
      // Only transition if not already in a terminal state
      if (existing.status !== "success" && existing.status !== "failed") {
        await ctx.db.patch(existing._id, value);
      }
      txId = existing._id;
    } else {
      txId = await ctx.db.insert("transactions", value);
    }

    if (args.paymentIntentId) {
      const intent = await ctx.db.get(args.paymentIntentId);
      if (intent && (intent.status === "created" || intent.status === "pending")) {
        const patch: Record<string, unknown> = {
          status: "pending",
          txHash: args.hash,
          updatedAt: now,
        };

        if (args.payerAddress !== undefined) {
          patch.payerAddress = args.payerAddress;
        }

        const currentStageTimestamps = intent.stageTimestamps || { created: intent.createdAt };
        const newStageTimestamps = args.stageTimestamps
          ? {
              ...currentStageTimestamps,
              awaiting_signature: args.stageTimestamps.startedSigning,
              signed: args.stageTimestamps.signed,
              submitted: args.stageTimestamps.submitted,
            }
          : {
              ...currentStageTimestamps,
              submitted: now,
            };

        patch.stageTimestamps = newStageTimestamps;
        await ctx.db.patch(args.paymentIntentId, patch);

        const existingJob = await ctx.db
          .query("paymentReconciliationJobs")
          .withIndex("by_payment_intent", (q) => q.eq("paymentIntentId", args.paymentIntentId!))
          .unique();
        if (!existingJob) {
          await ctx.db.insert("paymentReconciliationJobs", {
            paymentIntentId: args.paymentIntentId,
            projectId: intent.projectId,
            txHash: args.hash,
            state: "pending",
            attemptCount: 0,
            nextAttemptAt: now,
            leaseGeneration: 0,
            expiresAt: now + 30 * 60_000,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Schedule watcher (if transition is to pending and txHash exists, which matches our args)
        await ctx.scheduler.runAfter(0, internal.payment_intents.scanner.watchTransaction, {
          paymentIntentId: args.paymentIntentId,
          txHash: args.hash,
        });
      }
    }

    return txId;
  },
});
