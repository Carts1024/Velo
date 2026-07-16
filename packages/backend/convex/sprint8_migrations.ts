import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

const backfillRef = makeFunctionReference<"mutation">("sprint8_migrations:backfill");

// Additive, resumable backfill. Each invocation touches at most 100 rows per table.
export const backfill = internalMutation({
  args: {
    paymentCursor: v.optional(v.union(v.string(), v.null())),
    eventCursor: v.optional(v.union(v.string(), v.null())),
    payoutCursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const payments = await ctx.db
      .query("paymentIntents")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .paginate({ numItems: 100, cursor: args.paymentCursor ?? null });
    for (const intent of payments.page) {
      const existing = await ctx.db
        .query("paymentReconciliationJobs")
        .withIndex("by_payment_intent", (q) => q.eq("paymentIntentId", intent._id))
        .unique();
      if (!existing) {
        const now = Date.now();
        await ctx.db.insert("paymentReconciliationJobs", {
          paymentIntentId: intent._id,
          projectId: intent.projectId,
          ...(intent.txHash ? { txHash: intent.txHash } : {}),
          state: "pending",
          attemptCount: 0,
          nextAttemptAt: now,
          leaseGeneration: 0,
          expiresAt: now + 30 * 60 * 1_000,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const events = await ctx.db.query("providerEvents").paginate({
      numItems: 100,
      cursor: args.eventCursor ?? null,
    });
    for (const event of events.page) {
      if (!event.processingState) {
        await ctx.db.patch(event._id, {
          processingState: event.processed ? "processed" : "quarantined",
          ...(!event.processed ? { quarantineReason: "legacy_event_requires_review" } : {}),
          attemptCount: 0,
          nextAttemptAt: event.createdAt,
          leaseGeneration: 0,
        });
      }
    }

    const payouts = await ctx.db
      .query("settlementTransactions")
      .withIndex("by_status_and_updated_at", (q) => q.eq("status", "PAYOUT_PENDING"))
      .paginate({ numItems: 100, cursor: args.payoutCursor ?? null });
    for (const payout of payouts.page) {
      const existing = await ctx.db
        .query("providerOperations")
        .withIndex("by_project_provider_operation_and_client_key", (q) =>
          q
            .eq("projectId", payout.projectId)
            .eq("provider", "pdax")
            .eq("operation", "fiat_withdrawal")
            .eq("clientKey", payout.idempotencyId),
        )
        .unique();
      if (existing) continue;
      const now = Date.now();
      const hasStableIdentifier = Boolean(payout.withdrawalId);
      await ctx.db.insert("providerOperations", {
        projectId: payout.projectId,
        provider: "pdax",
        operation: "fiat_withdrawal",
        clientKey: payout.idempotencyId,
        // Legacy rows predate canonical request capture. This fixed digest-shaped
        // marker is immutable and is never substituted for a new request fingerprint.
        requestFingerprint: payout._id
          .replace(/[^a-f0-9]/gi, "0")
          .padEnd(64, "0")
          .slice(0, 64),
        requestJson: JSON.stringify({
          paymentIntentId: payout.paymentIntentId,
          ...(payout.withdrawalDetails ?? {}),
        }),
        providerKey: payout.withdrawalId ?? `legacy-recovery:${payout._id}`,
        state: hasStableIdentifier ? "provider_pending" : "dead_letter",
        attemptCount: 0,
        reconciliationCount: 0,
        nextAttemptAt: now,
        leaseGeneration: 0,
        unresolvedExpiresAt: now + 30 * 60 * 1_000,
        ...(hasStableIdentifier ? { providerPendingExpiresAt: now + 24 * 60 * 60 * 1_000 } : {}),
        ...(hasStableIdentifier
          ? {}
          : { errorMessage: "Legacy payout lacks a stable provider identifier" }),
        createdAt: now,
        updatedAt: now,
      });
    }

    if (!payments.isDone || !events.isDone || !payouts.isDone) {
      await ctx.scheduler.runAfter(0, backfillRef, {
        paymentCursor: payments.isDone ? null : payments.continueCursor,
        eventCursor: events.isDone ? null : events.continueCursor,
        payoutCursor: payouts.isDone ? null : payouts.continueCursor,
      });
    }
    return {
      paymentCount: payments.page.length,
      eventCount: events.page.length,
      payoutCount: payouts.page.length,
      done: payments.isDone && events.isDone && payouts.isDone,
    };
  },
});
