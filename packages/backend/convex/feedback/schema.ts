import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  walletAddress: v.string(),
  rating: v.number(),
  comment: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_wallet", ["walletAddress"]);
