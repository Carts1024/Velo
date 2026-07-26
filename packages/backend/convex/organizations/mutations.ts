import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

export const verify = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    evidenceType: v.union(
      v.literal("business_registration"),
      v.literal("manual_review"),
      v.literal("other"),
    ),
    evidenceReference: v.string(),
    actor: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) throw new Error("Organization not found");

    const evidenceReference = args.evidenceReference.trim();
    const actor = args.actor.trim();
    const reason = args.reason.trim();
    if (!evidenceReference || !actor || !reason) {
      throw new Error("Verification evidence, actor, and reason are required");
    }

    const now = Date.now();
    await ctx.db.patch(args.organizationId, {
      verificationStatus: "verified",
      verificationEvidenceType: args.evidenceType,
      verificationEvidenceReference: evidenceReference,
      verificationReason: reason,
      verifiedAt: now,
      verifiedBy: actor,
      trialState: organization.trialState === "granted" ? "granted" : "eligible",
      updatedAt: now,
    });
    return { applied: organization.verificationStatus !== "verified" };
  },
});

export const reject = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    actor: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) throw new Error("Organization not found");
    const now = Date.now();
    await ctx.db.patch(args.organizationId, {
      verificationStatus: "rejected",
      verificationReason: args.reason.trim(),
      verifiedBy: args.actor.trim(),
      trialState: "ineligible",
      updatedAt: now,
    });
    return null;
  },
});
