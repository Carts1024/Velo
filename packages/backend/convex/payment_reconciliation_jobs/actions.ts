"use node";

import { randomUUID } from "crypto";

import { lookupTestnetTransaction } from "@repo/stellar";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { internalAction } from "../_generated/server";

const claimRef = makeFunctionReference<"mutation">(
  "payment_reconciliation_jobs/mutations:claimDue",
);
const finishRef = makeFunctionReference<"mutation">("payment_reconciliation_jobs/mutations:finish");
const paidRef = makeFunctionReference<"mutation">("payment_intents/mutations:markVerifiedPaid");
const drainRef = makeFunctionReference<"action">("payment_reconciliation_jobs/actions:drain");
const WORKER_CONCURRENCY = 10;

export const drain = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const leaseToken = randomUUID();
    const jobs = (await ctx.runMutation(claimRef, {
      leaseToken,
      limit: Math.min(args.limit ?? 100, 100),
    })) as Array<{
      _id: string;
      paymentIntentId: string;
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
              await ctx.runMutation(paidRef, {
                paymentIntentId: job.paymentIntentId,
                txHash: job.txHash,
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
    if (jobs.length === Math.min(args.limit ?? 100, 100)) {
      await ctx.scheduler.runAfter(0, drainRef, { limit: Math.min(args.limit ?? 100, 100) });
    }
    return { claimed: jobs.length, processed };
  },
});
