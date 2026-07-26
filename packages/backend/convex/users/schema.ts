import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  walletAddress: v.string(),
  tokenIdentifier: v.optional(v.string()),
  name: v.string(),
  email: v.string(),
  avatarStorageId: v.optional(v.id("_storage")),
  createdAt: v.number(),
  lastSeenAt: v.number(),
})
  .index("by_wallet", ["walletAddress"])
  .index("by_token_identifier", ["tokenIdentifier"]);
