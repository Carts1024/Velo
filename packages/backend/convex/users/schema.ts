import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  walletAddress: v.string(),
  name: v.string(),
  email: v.string(),
  createdAt: v.number(),
  lastSeenAt: v.number(),
}).index("by_wallet", ["walletAddress"]);
