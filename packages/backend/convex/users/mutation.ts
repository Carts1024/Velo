import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

import { mutation } from "../_generated/server";
import { normalizeAddress, requireIdentity } from "../projects/helpers";

// eslint-disable-next-line no-control-regex -- intentionally stripping control chars
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

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

async function validateAvatarStorage(ctx: MutationCtx, avatarStorageId: Id<"_storage">) {
  const metadata = await ctx.db.system.get("_storage", avatarStorageId);

  if (!metadata) {
    throw new Error("Avatar upload not found");
  }

  if (!metadata.contentType?.startsWith("image/")) {
    throw new Error("Avatar must be an image");
  }

  if (metadata.size > MAX_AVATAR_SIZE_BYTES) {
    throw new Error("Avatar must be 2 MB or smaller");
  }
}

export const upsertProfile = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const walletAddress = normalizeAddress(identity.subject);
    const name = sanitizeName(args.name);
    const email = sanitizeEmail(args.email);
    const now = Date.now();

    if (args.avatarStorageId !== undefined) {
      await validateAvatarStorage(ctx, args.avatarStorageId);
    }

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
      const previousAvatarStorageId = user.avatarStorageId;
      await ctx.db.patch(user._id, {
        tokenIdentifier: identity.tokenIdentifier,
        name,
        email,
        ...(args.avatarStorageId !== undefined ? { avatarStorageId: args.avatarStorageId } : {}),
        lastSeenAt: now,
      });

      if (
        previousAvatarStorageId &&
        args.avatarStorageId !== undefined &&
        previousAvatarStorageId !== args.avatarStorageId
      ) {
        await ctx.storage.delete(previousAvatarStorageId);
      }

      return user._id;
    }

    return await ctx.db.insert("users", {
      walletAddress,
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      ...(args.avatarStorageId !== undefined ? { avatarStorageId: args.avatarStorageId } : {}),
      createdAt: now,
      lastSeenAt: now,
    });
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const removeAvatar = mutation({
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

    if (!user) {
      throw new Error("Profile not found");
    }

    const avatarStorageId = user.avatarStorageId;
    await ctx.db.patch(user._id, {
      tokenIdentifier: identity.tokenIdentifier,
      avatarStorageId: undefined,
      lastSeenAt: Date.now(),
    });

    if (avatarStorageId) {
      await ctx.storage.delete(avatarStorageId);
    }
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
