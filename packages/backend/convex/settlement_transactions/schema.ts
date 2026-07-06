import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  paymentIntentId: v.optional(v.id("payment_intents")),
  provider: v.literal("pdax"),
  status: v.union(
    v.literal("QUOTE_PENDING"),
    v.literal("QUOTE_FIRM"),
    v.literal("TRADE_EXECUTED"),
    v.literal("PAYOUT_PENDING"),
    v.literal("PAYOUT_SUCCEEDED"),
    v.literal("PAYOUT_FAILED"),
  ),
  idempotencyId: v.string(),
  quoteId: v.optional(v.string()),
  orderId: v.optional(v.number()),
  withdrawalId: v.optional(v.string()), // matches PDAX identifier or reference number
  tradeDetails: v.optional(
    v.object({
      orderId: v.number(),
      price: v.number(),
      amount: v.number(),
      quantity: v.number(),
      status: v.string(),
    }),
  ),
  withdrawalDetails: v.optional(
    v.object({
      referenceNumber: v.optional(v.string()),
      amount: v.number(),
      fee: v.number(),
      status: v.string(),
      bankCode: v.string(),
      accountName: v.string(),
      accountNumber: v.string(),
    }),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_idempotency", ["idempotencyId"])
  .index("by_payment_intent", ["paymentIntentId"])
  .index("by_order_id", ["orderId"])
  .index("by_withdrawal_id", ["withdrawalId"]);
