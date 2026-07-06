import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  provider: v.literal("pdax"),
  eventId: v.string(), // reference_number, txn_hash, request_id, etc.
  type: v.union(v.literal("DEPOSIT"), v.literal("WITHDRAWAL"), v.literal("TRADE")),
  rawEvent: v.string(), // JSON stringified payload
  processed: v.boolean(),
  createdAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_event_id", ["eventId"]);
