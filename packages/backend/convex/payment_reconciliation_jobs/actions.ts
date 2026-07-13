"use node";

import { randomUUID } from "crypto";

import { lookupTestnetTransaction } from "@repo/stellar";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";

import { internalAction } from "../_generated/server";
import { findVerifiedPayment } from "../payment_intents/verification";

const claimRef = makeFunctionReference<"mutation">(
  "payment_reconciliation_jobs/mutations:claimDue",
);
const recoverExpiredLeasesRef = makeFunctionReference<"mutation">(
  "payment_reconciliation_jobs/mutations:recoverExpiredLeases",
);
const finishRef = makeFunctionReference<"mutation">("payment_reconciliation_jobs/mutations:finish");
const paidRef = makeFunctionReference<"mutation">("payment_intents/mutations:markVerifiedPaid");
const getIntentRef = makeFunctionReference<"query">(
  "payment_intents/queries:getPaymentIntentInternal",
);
const updateStatusRef = makeFunctionReference<"mutation">("payment_intents/mutations:updateStatus");
const drainRef = makeFunctionReference<"action">("payment_reconciliation_jobs/actions:drain");
const WORKER_CONCURRENCY = 10;

export const drain = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 100), 100));
    const leaseToken = randomUUID();
    const recovery = (await ctx.runMutation(recoverExpiredLeasesRef, {
      limit,
    })) as {
      recovered: number;
      deadLettered: number;
      saturated: boolean;
    };
    const jobs = (await ctx.runMutation(claimRef, {
      leaseToken,
      limit,
    })) as Array<{
      _id: string;
      paymentIntentId: string;
      projectId: string;
      txHash?: string;
      leaseGeneration: number;
    }>;
    let processed = 0;
    for (let offset = 0; offset < jobs.length; offset += WORKER_CONCURRENCY) {
      await Promise.all(
        jobs.slice(offset, offset + WORKER_CONCURRENCY).map(async (job) => {
          try {
            if (!job.txHash) throw new Error("Pending payment has no transaction hash");
            const result = await lookupTestnetTransaction(
              process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
              job.txHash,
              { timeoutMs: 2_500 },
            );
            if (result.status === "success") {
              const intent = (await ctx.runQuery(getIntentRef, {
                paymentIntentId: job.paymentIntentId,
              })) as Doc<"paymentIntents"> | null;
              if (!intent) throw new Error("Payment intent not found");
              const verifiedPayment = findVerifiedPayment(result.operations, intent);
              if (!verifiedPayment) {
                await ctx.runMutation(updateStatusRef, {
                  paymentIntentId: job.paymentIntentId,
                  status: "failed",
                });
                await ctx.runMutation(finishRef, {
                  jobId: job._id,
                  leaseToken,
                  leaseGeneration: job.leaseGeneration,
                  resolved: true,
                });
                processed++;
                return;
              }
              await ctx.runMutation(paidRef, {
                paymentIntentId: job.paymentIntentId,
                txHash: job.txHash,
                verifiedPayment,
              });
              await ctx.runMutation(finishRef, {
                jobId: job._id,
                leaseToken,
                leaseGeneration: job.leaseGeneration,
                resolved: true,
              });
              processed++;
            } else if (result.status === "failed") {
              await ctx.runMutation(updateStatusRef, {
                paymentIntentId: job.paymentIntentId,
                status: "failed",
              });
              await ctx.runMutation(finishRef, {
                jobId: job._id,
                leaseToken,
                leaseGeneration: job.leaseGeneration,
                resolved: true,
              });
              processed++;
            } else {
              await ctx.runMutation(finishRef, {
                jobId: job._id,
                leaseToken,
                leaseGeneration: job.leaseGeneration,
                resolved: false,
                errorMessage: `RPC status: ${result.status}`,
              });
            }
          } catch (error) {
            await ctx.runMutation(finishRef, {
              jobId: job._id,
              leaseToken,
              leaseGeneration: job.leaseGeneration,
              resolved: false,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
    }
    if (recovery.saturated || jobs.length === limit) {
      await ctx.scheduler.runAfter(0, drainRef, { limit });
    }
    return {
      claimed: jobs.length,
      processed,
      recovered: recovery.recovered,
      deadLettered: recovery.deadLettered,
    };
  },
});
