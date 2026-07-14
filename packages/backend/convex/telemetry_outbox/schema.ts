import { defineTable } from "convex/server";
import { v } from "convex/values";

export const telemetryStageValidator = v.union(
  v.literal("auth"),
  v.literal("indexed_read"),
  v.literal("mutation"),
  v.literal("provider_auth"),
  v.literal("provider_call"),
  v.literal("submission"),
  v.literal("ledger_wait"),
  v.literal("observation"),
  v.literal("state_update"),
  v.literal("queue_wait"),
  v.literal("webhook_network"),
  v.literal("ui_render"),
);

export default defineTable({
  kind: v.union(v.literal("span"), v.literal("metric")),
  name: v.string(),
  operation: v.string(),
  stage: telemetryStageValidator,
  outcome: v.union(
    v.literal("success"),
    v.literal("error"),
    v.literal("timeout"),
    v.literal("retry"),
    v.literal("rejected"),
  ),
  requestCorrelationId: v.optional(v.string()),
  journeyCorrelationId: v.optional(v.string()),
  traceparent: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  errorCode: v.optional(v.string()),
  value: v.optional(v.number()),
  state: v.union(v.literal("pending"), v.literal("leased"), v.literal("dead_letter")),
  attemptCount: v.number(),
  nextAttemptAt: v.number(),
  leaseToken: v.optional(v.string()),
  leaseGeneration: v.number(),
  leaseExpiresAt: v.optional(v.number()),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index("by_state_and_next_attempt_at", ["state", "nextAttemptAt"])
  .index("by_state_and_lease_expires_at", ["state", "leaseExpiresAt"])
  .index("by_journey_correlation_id", ["journeyCorrelationId"])
  .index("by_expires_at", ["expiresAt"]);
