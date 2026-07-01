import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  walletAddress: v.string(),
  tokenIdentifier: v.optional(v.string()),
  rating: v.number(),
  comment: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_wallet", ["walletAddress"])
  .index("by_token_identifier", ["tokenIdentifier"]);
