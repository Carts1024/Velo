import { lookupTestnetTransaction } from "@repo/stellar";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";

import { api, internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";

const DEFAULT_TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";

function rpcUrl() {
  return (
    process.env.STELLAR_RPC_URL ??
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
    DEFAULT_TESTNET_RPC_URL
  );
}

/**
 * Periodically checks all pending payments against the on-chain ledger to verify success or failure.
 */
export const checkPendingPayments = internalAction({
  args: {},
  handler: async (ctx): Promise<{ totalChecked: number; processedCount: number }> => {
    const pendingIntents = (await ctx.runQuery(
      internal.payment_intents.scanner.getPendingPaymentIntents,
      { limit: 100 },
    )) as Doc<"paymentIntents">[];
    let processedCount = 0;
    const url = rpcUrl();

    for (const intent of pendingIntents) {
      const now = Date.now();

      if (intent.txHash) {
        try {
          const result = await lookupTestnetTransaction(url, intent.txHash);

          if (result.status === "success") {
            await ctx.runMutation(internal.payment_intents.mutations.markVerifiedPaid, {
              paymentIntentId: intent._id,
              txHash: intent.txHash,
            });
            await ctx.runMutation(internal.payment_intents.scanner.decrementProjectCredits, {
              projectId: intent.projectId,
            });
            processedCount++;
          } else if (result.status === "failed") {
            await ctx.runMutation(api.payment_intents.mutations.updateStatus, {
              paymentIntentId: intent._id,
              status: "failed",
            });
            processedCount++;
          } else if (result.status === "not_found") {
            // Fail if pending for more than 6 minutes without on-chain confirmation
            if (now - intent.updatedAt > 6 * 60 * 1000) {
              await ctx.runMutation(api.payment_intents.mutations.updateStatus, {
                paymentIntentId: intent._id,
                status: "failed",
              });
              processedCount++;
            }
          }
        } catch (error) {
          console.error(`Error looking up transaction ${intent.txHash}:`, error);
        }
      } else {
        // No hash and pending for more than 6 minutes
        if (now - intent.updatedAt > 6 * 60 * 1000) {
          await ctx.runMutation(api.payment_intents.mutations.updateStatus, {
            paymentIntentId: intent._id,
            status: "failed",
          });
          processedCount++;
        }
      }
    }

    return { totalChecked: pendingIntents.length, processedCount };
  },
});

/**
 * Returns all payment intents in 'pending' status. Bounded by a limit.
 */
export const getPendingPaymentIntents = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("paymentIntents")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(limit);
  },
});

/**
 * Decrements the off-chain project credits count upon a successful payment.
 */
export const decrementProjectCredits = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project && project.checkoutCredits !== undefined && project.checkoutCredits > 0) {
      await ctx.db.patch(args.projectId, {
        checkoutCredits: Math.max(0, project.checkoutCredits - 1),
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Internal query to fetch the projectId of a payment intent.
 */
export const getIntentProject = internalQuery({
  args: { paymentIntentId: v.id("paymentIntents") },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.paymentIntentId);
    return intent ? intent.projectId : null;
  },
});

/**
 * Background action to poll Stellar RPC with adaptive jittered backoff.
 */
export const watchTransaction = internalAction({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    txHash: v.string(),
  },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const url = rpcUrl();
    const startTime = Date.now();
    const timeoutMs = 60 * 1000;
    let delay = 250;

    while (Date.now() - startTime < timeoutMs) {
      // Re-query current status of the payment intent to see if it was already updated by scanner/reconciliation
      const currentIntent = await ctx.runQuery(
        internal.payment_intents.queries.getPaymentIntentInternal,
        {
          paymentIntentId: args.paymentIntentId,
        },
      );

      if (!currentIntent || currentIntent.status === "paid" || currentIntent.status === "failed") {
        return { status: currentIntent?.status ?? "not_found" };
      }

      try {
        const result = await lookupTestnetTransaction(url, args.txHash);

        if (result.status === "success") {
          await ctx.runMutation(internal.payment_intents.mutations.markVerifiedPaid, {
            paymentIntentId: args.paymentIntentId,
            txHash: args.txHash,
          });
          const projectId = await ctx.runQuery(internal.payment_intents.scanner.getIntentProject, {
            paymentIntentId: args.paymentIntentId,
          });
          if (projectId) {
            await ctx.runMutation(internal.payment_intents.scanner.decrementProjectCredits, {
              projectId,
            });
            // Fast-path event polling
            await ctx.scheduler.runAfter(0, internal.contractEventPolling.pollProjectInternal, {
              projectId,
            });
          }
          return { status: "success" };
        } else if (result.status === "failed") {
          await ctx.runMutation(api.payment_intents.mutations.updateStatus, {
            paymentIntentId: args.paymentIntentId,
            status: "failed",
          });
          return { status: "failed" };
        }
      } catch (error) {
        console.error(`Error checking transaction ${args.txHash} in watchTransaction:`, error);
      }

      const jitter = Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      delay = Math.min(delay * 2, 5000);
    }

    console.log(`watchTransaction for ${args.txHash} timed out. Handing off to reconciliation.`);
    return { status: "timeout" };
  },
});
