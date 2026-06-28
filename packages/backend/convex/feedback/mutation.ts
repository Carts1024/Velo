import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { normalizeAddress } from "../projects/helpers";

// eslint-disable-next-line no-control-regex -- intentionally stripping control chars
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
const COMMENT_MAX = 2000;

function sanitizeRating(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0 || raw > 5) {
    throw new Error("Rating must be an integer between 0 and 5");
  }

  return raw;
}

function sanitizeComment(raw: string): string {
  const trimmed = raw.trim().replace(CONTROL_CHARS_PATTERN, "").slice(0, COMMENT_MAX);

  if (trimmed.length === 0) {
    throw new Error("Comment is required");
  }

  return trimmed;
}

export const submitFeedback = mutation({
  args: {
    walletAddress: v.string(),
    rating: v.number(),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const walletAddress = normalizeAddress(args.walletAddress);
    const rating = sanitizeRating(args.rating);
    const comment = sanitizeComment(args.comment);
    const now = Date.now();

    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        rating,
        comment,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("feedback", {
      walletAddress,
      rating,
      comment,
      createdAt: now,
      updatedAt: now,
    });
  },
});
