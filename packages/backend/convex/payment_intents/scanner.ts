import { lookupTestnetTransaction } from "@repo/stellar";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";

import { api, internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import { findVerifiedPayment } from "./verification";

const ensureReconciliation = makeFunctionReference<"mutation">(
  "payment_reconciliation_jobs/mutations:ensure",
);

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
      if (intent.txHash) {
        try {
          const result = await lookupTestnetTransaction(url, intent.txHash, { timeoutMs: 2_500 });

          if (result.status === "success") {
            const verifiedPayment = findVerifiedPayment(result.operations, intent);
            if (!verifiedPayment) {
              await ctx.runMutation(api.payment_intents.mutations.updateStatus, {
                paymentIntentId: intent._id,
                status: "failed",
              });
              processedCount++;
              continue;
            }
            const observedAt = Date.now();
            const confirmation = await ctx.runMutation(
              internal.payment_intents.mutations.markVerifiedPaid,
              {
                paymentIntentId: intent._id,
                txHash: intent.txHash,
                verifiedPayment,
                observedAt,
              },
            );
            if (confirmation.applied) processedCount++;
          } else if (result.status === "failed") {
            await ctx.runMutation(api.payment_intents.mutations.updateStatus, {
              paymentIntentId: intent._id,
              status: "failed",
            });
            processedCount++;
          } else if (result.status === "not_found") {
            await ctx.runMutation(ensureReconciliation, {
              paymentIntentId: intent._id,
              projectId: intent.projectId,
              txHash: intent.txHash,
            });
          }
        } catch (error) {
          await ctx.runMutation(ensureReconciliation, {
            paymentIntentId: intent._id,
            projectId: intent.projectId,
            txHash: intent.txHash,
          });
          console.error(`Error looking up transaction ${intent.txHash}:`, error);
        }
      } else {
        await ctx.runMutation(ensureReconciliation, {
          paymentIntentId: intent._id,
          projectId: intent.projectId,
        });
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
        const result = await lookupTestnetTransaction(url, args.txHash, { timeoutMs: 2_500 });

        if (result.status === "success") {
          const verifiedPayment = findVerifiedPayment(result.operations, currentIntent);
          if (!verifiedPayment) {
            await ctx.runMutation(api.payment_intents.mutations.updateStatus, {
              paymentIntentId: args.paymentIntentId,
              status: "failed",
            });
            return { status: "failed" };
          }
          const observedAt = Date.now();
          const confirmation = await ctx.runMutation(
            internal.payment_intents.mutations.markVerifiedPaid,
            {
              paymentIntentId: args.paymentIntentId,
              txHash: args.txHash,
              verifiedPayment,
              observedAt,
            },
          );
          if (confirmation.applied) {
            // Fast-path event polling
            await ctx.scheduler.runAfter(0, internal.contractEventPolling.pollProjectInternal, {
              projectId: confirmation.projectId,
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
