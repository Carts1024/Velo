import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  provider: v.literal("pdax"),
  operation: v.union(v.literal("trade"), v.literal("fiat_withdrawal")),
  clientKey: v.string(),
  requestFingerprint: v.string(),
  requestJson: v.optional(v.string()),
  providerKey: v.string(),
  state: v.union(
    v.literal("prepared"),
    v.literal("submitting"),
    v.literal("provider_pending"),
    v.literal("reconciling"),
    v.literal("succeeded"),
    v.literal("failed"),
    v.literal("dead_letter"),
  ),
  attemptCount: v.number(),
  reconciliationCount: v.number(),
  nextAttemptAt: v.number(),
  leaseToken: v.optional(v.string()),
  leaseGeneration: v.number(),
  leaseExpiresAt: v.optional(v.number()),
  unresolvedExpiresAt: v.number(),
  providerPendingExpiresAt: v.optional(v.number()),
  providerReference: v.optional(v.string()),
  resultJson: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  responseSummary: v.optional(
    v.object({
      status: v.string(),
      providerReference: v.optional(v.string()),
    }),
  ),
  errorCode: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_project_provider_operation_and_client_key", [
    "projectId",
    "provider",
    "operation",
    "clientKey",
  ])
  .index("by_provider_and_provider_key", ["provider", "providerKey"])
  .index("by_state_and_next_attempt_at", ["state", "nextAttemptAt"])
  .index("by_state_and_lease_expires_at", ["state", "leaseExpiresAt"])
  .index("by_project_and_created_at", ["projectId", "createdAt"]);
