import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { recordMetric } from "../telemetry_outbox/helpers";
import { createBillingException } from "./exceptions";

export const run = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 25)));
    let discrepancies = 0;

    const settledTopups = await ctx.db
      .query("billingTopups")
      .withIndex("by_status_and_updated_at", (q) => q.eq("status", "settled"))
      .take(limit);
    for (const topup of settledTopups) {
      const receipt = await ctx.db
        .query("treasuryReceipts")
        .withIndex("by_topup_id", (q) => q.eq("topupId", topup._id))
        .unique();
      const grants = await ctx.db
        .query("billingLedgerEntries")
        .withIndex("by_organization_id_and_book", (q) =>
          q.eq("organizationId", topup.organizationId).eq("book", "commercial"),
        )
        .take(1_000);
      const grant = grants.find(
        (entry) => entry.entryType === "paid_grant" && entry.topupReference === topup._id,
      );
      if (!receipt || !grant || topup.treasuryReceiptId !== receipt?._id) {
        discrepancies++;
        await createBillingException(ctx, {
          organizationId: topup.organizationId,
          exceptionType: "receipt_mismatch",
          dedupeKey: `reconcile:topup:${topup._id}`,
          summary: "Settled top-up is missing its exact receipt or paid grant",
          evidence: {
            topupId: topup._id,
            receiptId: receipt?._id,
            linkedReceiptId: topup.treasuryReceiptId,
            grantId: grant?._id,
          },
          topupId: topup._id,
          paymentIntentId: topup.paymentIntentId,
          treasuryReceiptId: receipt?._id,
        });
      }
    }

    const receipts = await ctx.db.query("treasuryReceipts").order("desc").take(limit);
    for (const receipt of receipts) {
      const topup = await ctx.db.get(receipt.topupId);
      if (
        !topup ||
        topup.status !== "settled" ||
        topup.treasuryReceiptId !== receipt._id ||
        topup.paymentIntentId !== receipt.paymentIntentId
      ) {
        discrepancies++;
        await createBillingException(ctx, {
          organizationId: receipt.organizationId,
          exceptionType: "receipt_mismatch",
          dedupeKey: `reconcile:receipt:${receipt._id}`,
          summary: "Treasury receipt is not linked to one settled top-up",
          evidence: { receiptId: receipt._id, topupId: receipt.topupId },
          topupId: receipt.topupId,
          paymentIntentId: receipt.paymentIntentId,
          treasuryReceiptId: receipt._id,
        });
      }
    }

    const activeReservations = await ctx.db
      .query("creditReservations")
      .withIndex("by_status_and_expires_at", (q) => q.eq("status", "active"))
      .take(limit);
    for (const reservation of activeReservations) {
      if (!reservation.paymentIntentId) continue;
      const intent = await ctx.db.get(reservation.paymentIntentId);
      if (
        !intent ||
        intent.status === "paid" ||
        intent.status === "failed" ||
        intent.status === "cancelled"
      ) {
        discrepancies++;
        await createBillingException(ctx, {
          organizationId: reservation.organizationId,
          exceptionType: "reservation_mismatch",
          dedupeKey: `reconcile:reservation:${reservation._id}:${intent?.status ?? "missing"}`,
          summary: "Active reservation does not match its PaymentIntent state",
          evidence: { reservationId: reservation._id, intentStatus: intent?.status ?? "missing" },
          paymentIntentId: reservation.paymentIntentId,
          reservationId: reservation._id,
        });
      }
    }

    const balances = await ctx.db.query("billingBalances").take(limit);
    for (const balance of balances) {
      const lots = await ctx.db
        .query("creditLots")
        .withIndex("by_organization_id_and_book_and_credit_class", (q) =>
          q.eq("organizationId", balance.organizationId).eq("book", balance.book),
        )
        .take(1_000);
      const totals = {
        promoAvailable: 0n,
        promoReserved: 0n,
        promoConsumed: 0n,
        promoExpired: 0n,
        paidAvailable: 0n,
        paidReserved: 0n,
        paidConsumed: 0n,
        paidExpired: 0n,
      };
      for (const lot of lots) {
        const prefix = lot.creditClass === "promotional" ? "promo" : "paid";
        totals[`${prefix}Available`] += lot.available;
        totals[`${prefix}Reserved`] += lot.reserved;
        totals[`${prefix}Consumed`] += lot.consumed;
        totals[`${prefix}Expired`] += lot.expired;
      }
      const fields = Object.keys(totals) as Array<keyof typeof totals>;
      if (fields.some((field) => totals[field] !== balance[field])) {
        discrepancies++;
        await createBillingException(ctx, {
          organizationId: balance.organizationId,
          exceptionType: "ledger_mismatch",
          dedupeKey: `reconcile:balance:${balance._id}:${balance.version}`,
          summary: "Materialized billing balance does not match credit lots",
          evidence: {
            balanceId: balance._id,
            version: balance.version,
            expected: Object.fromEntries(fields.map((field) => [field, totals[field].toString()])),
          },
        });
      }
    }

    await recordMetric(
      ctx,
      "velo_billing_reconciliation_exception_total",
      "billing_reconciliation",
      "mutation",
      discrepancies === 0 ? "success" : "error",
      discrepancies,
    );
    return { discrepancies };
  },
});
