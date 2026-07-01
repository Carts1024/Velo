import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { normalizeAddress, requireIdentity } from "../projects/helpers";

// eslint-disable-next-line no-control-regex -- intentionally stripping control chars
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeName(raw: string): string {
  const trimmed = raw.trim().replace(CONTROL_CHARS_PATTERN, "").slice(0, 100);

  if (trimmed.length === 0) {
    throw new Error("Name is required");
  }

  return trimmed;
}

function sanitizeEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(CONTROL_CHARS_PATTERN, "").slice(0, 255);

  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new Error("Invalid email address");
  }

  return trimmed;
}

export const upsertProfile = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const walletAddress = normalizeAddress(identity.subject);
    const name = sanitizeName(args.name);
    const email = sanitizeEmail(args.email);
    const now = Date.now();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    const legacyExisting = existing
      ? null
      : await ctx.db
          .query("users")
          .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
          .unique();
    const user = existing ?? legacyExisting;

    if (user) {
      await ctx.db.patch(user._id, {
        tokenIdentifier: identity.tokenIdentifier,
        name,
        email,
        lastSeenAt: now,
      });
      return user._id;
    }

    return await ctx.db.insert("users", {
      walletAddress,
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      createdAt: now,
      lastSeenAt: now,
    });
  },
});

export const updateLastSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const walletAddress = normalizeAddress(identity.subject);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    const legacyExisting = existing
      ? null
      : await ctx.db
          .query("users")
          .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
          .unique();
    const user = existing ?? legacyExisting;

    if (user) {
      await ctx.db.patch(user._id, {
        tokenIdentifier: identity.tokenIdentifier,
        lastSeenAt: Date.now(),
      });
    }
  },
});
