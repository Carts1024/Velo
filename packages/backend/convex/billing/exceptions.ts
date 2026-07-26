import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

import { mutation, query } from "../_generated/server";
import { requireBillingOperator } from "./access";

type ExceptionType =
  | "topup_mismatch"
  | "reused_transaction"
  | "reservation_mismatch"
  | "ledger_mismatch"
  | "receipt_mismatch"
  | "verification_ambiguous";

export async function createBillingException(
  ctx: MutationCtx,
  args: {
    organizationId?: Id<"organizations">;
    exceptionType: ExceptionType;
    dedupeKey: string;
    summary: string;
    evidence: Record<string, unknown>;
    paymentIntentId?: Id<"paymentIntents">;
    reservationId?: Id<"creditReservations">;
    topupId?: Id<"billingTopups">;
    treasuryReceiptId?: Id<"treasuryReceipts">;
  },
) {
  const existing = await ctx.db
    .query("billingExceptions")
    .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey))
    .unique();
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("billingExceptions", {
    organizationId: args.organizationId,
    exceptionType: args.exceptionType,
    status: "open",
    dedupeKey: args.dedupeKey,
    summary: args.summary,
    evidenceJson: JSON.stringify(args.evidence),
    paymentIntentId: args.paymentIntentId,
    reservationId: args.reservationId,
    topupId: args.topupId,
    treasuryReceiptId: args.treasuryReceiptId,
    createdAt: now,
    updatedAt: now,
  });
}

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBillingOperator(ctx);
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)));
    return args.status
      ? await ctx.db
          .query("billingExceptions")
          .withIndex("by_status_and_created_at", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(limit)
      : await ctx.db.query("billingExceptions").order("desc").take(limit);
  },
});

const adjustRef = makeFunctionReference<"mutation">("billing/mutations:adjust");

export const resolve = mutation({
  args: {
    exceptionId: v.id("billingExceptions"),
    action: v.union(
      v.literal("acknowledge"),
      v.literal("retry_verification"),
      v.literal("compensating_adjustment"),
    ),
    note: v.string(),
    adjustmentAmount: v.optional(v.int64()),
    adjustmentCreditClass: v.optional(v.union(v.literal("promotional"), v.literal("paid"))),
  },
  handler: async (ctx, args) => {
    const operator = await requireBillingOperator(ctx);
    const exception = await ctx.db.get(args.exceptionId);
    if (!exception) throw new Error("Billing exception not found");
    if (exception.status === "resolved") return { applied: false as const };
    const note = args.note.trim();
    if (!note) throw new Error("Resolution note is required");

    let resolutionLedgerEntryId: Id<"billingLedgerEntries"> | undefined;
    if (args.action === "compensating_adjustment") {
      if (
        !exception.organizationId ||
        args.adjustmentAmount === undefined ||
        args.adjustmentAmount === 0n ||
        !args.adjustmentCreditClass
      ) {
        throw new Error("Compensating adjustment details are required");
      }
      const adjustment = (await ctx.runMutation(adjustRef, {
        organizationId: exception.organizationId,
        book: "commercial",
        creditClass: args.adjustmentCreditClass,
        amount: args.adjustmentAmount,
        entryType: "adjustment",
        idempotencyKey: `exception-resolution:${exception._id}`,
        actor: `operator:${operator.walletAddress}`,
        reason: note,
      })) as { applied: boolean; ledgerEntryId?: Id<"billingLedgerEntries"> };
      resolutionLedgerEntryId = adjustment.ledgerEntryId;
    }

    if (args.action === "retry_verification" && exception.paymentIntentId) {
      const intent = await ctx.db.get(exception.paymentIntentId);
      if (intent?.txHash) {
        await ctx.scheduler.runAfter(
          0,
          makeFunctionReference<"action">("payment_intents/scanner:watchTransaction"),
          { paymentIntentId: intent._id, txHash: intent.txHash },
        );
      }
    }

    const now = Date.now();
    await ctx.db.patch(exception._id, {
      status: "resolved",
      resolutionAction: args.action,
      resolutionNote: note,
      resolutionLedgerEntryId,
      resolvedBy: operator.walletAddress,
      resolvedAt: now,
      updatedAt: now,
    });
    return { applied: true as const, resolutionLedgerEntryId };
  },
});
