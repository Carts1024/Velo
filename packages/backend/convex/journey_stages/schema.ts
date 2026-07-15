import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  journeyCorrelationId: v.string(),
  name: v.union(
    v.literal("provider.ingested"),
    v.literal("worker.provider_hint_quarantined"),
    v.literal("webhook.enqueued"),
    v.literal("webhook.acknowledged"),
    v.literal("webhook.failed"),
    v.literal("ui.rendered"),
  ),
  source: v.union(
    v.literal("api"),
    v.literal("provider"),
    v.literal("worker"),
    v.literal("webhook"),
    v.literal("ui"),
  ),
  outcome: v.union(v.literal("success"), v.literal("error"), v.literal("pending")),
  at: v.number(),
  durationMs: v.optional(v.number()),
  expiresAt: v.number(),
})
  .index("by_journey_correlation_id_and_at", ["journeyCorrelationId", "at"])
  .index("by_name_and_at", ["name", "at"])
  .index("by_expires_at", ["expiresAt"]);
