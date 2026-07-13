import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.optional(v.id("projects")),
  provider: v.literal("pdax"),
  eventId: v.string(), // reference_number, txn_hash, request_id, etc.
  type: v.union(v.literal("DEPOSIT"), v.literal("WITHDRAWAL"), v.literal("TRADE")),
  rawEvent: v.string(), // JSON stringified payload
  processed: v.boolean(),
  processingState: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("leased"),
      v.literal("processed"),
      v.literal("quarantined"),
      v.literal("dead_letter"),
    ),
  ),
  payloadDigest: v.optional(v.string()),
  quarantineReason: v.optional(v.string()),
  attemptCount: v.optional(v.number()),
  nextAttemptAt: v.optional(v.number()),
  leaseToken: v.optional(v.string()),
  leaseGeneration: v.optional(v.number()),
  leaseExpiresAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_event_id", ["eventId"])
  .index("by_payload_digest", ["payloadDigest"])
  .index("by_processing_state_and_next_attempt_at", ["processingState", "nextAttemptAt"])
  .index("by_processing_state_and_lease_expires_at", ["processingState", "leaseExpiresAt"]);
