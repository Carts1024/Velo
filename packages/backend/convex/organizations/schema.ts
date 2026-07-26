import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  ownerTokenIdentifier: v.string(),
  ownerAddress: v.string(),
  displayName: v.string(),
  verificationStatus: v.union(
    v.literal("provisional"),
    v.literal("verified"),
    v.literal("rejected"),
  ),
  verificationEvidenceType: v.optional(
    v.union(v.literal("business_registration"), v.literal("manual_review"), v.literal("other")),
  ),
  verificationEvidenceReference: v.optional(v.string()),
  verificationReason: v.optional(v.string()),
  verifiedAt: v.optional(v.number()),
  verifiedBy: v.optional(v.string()),
  trialState: v.union(
    v.literal("pending_verification"),
    v.literal("eligible"),
    v.literal("granted"),
    v.literal("ineligible"),
  ),
  trialGrantedAt: v.optional(v.number()),
  trialExpiresAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_owner_token_identifier", ["ownerTokenIdentifier"])
  .index("by_owner_address", ["ownerAddress"])
  .index("by_verification_status", ["verificationStatus"]);
