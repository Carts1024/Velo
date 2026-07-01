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
 * Returns all payment intents in 'pending' status.
 */
export const getPendingPaymentIntents = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("paymentIntents")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
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
