import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  paymentIntentId: v.optional(v.id("paymentIntents")),
  provider: v.literal("pdax"),
  quoteId: v.string(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  quoteCurrency: v.string(),
  baseCurrency: v.string(),
  quantity: v.string(),
  price: v.number(),
  totalAmount: v.number(),
  expiresAt: v.number(), // Unix epoch ms
  status: v.union(v.literal("active"), v.literal("expired"), v.literal("executed")),
  createdAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_quote_id", ["quoteId"])
  .index("by_payment_intent", ["paymentIntentId"]);
