import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";

import { mutation, query, type MutationCtx } from "./_generated/server";

const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{64}$/i;

const draftProjectArgs = {
  name: v.string(),
  slug: v.string(),
  description: v.string(),
  website: v.optional(v.string()),
  metadataJson: v.string(),
  metadataHash: v.string(),
  ownerAddress: v.string(),
};

function normalizeAddress(address: string) {
  return address.trim().toUpperCase();
}

function normalizeTransactionHash(hash: string) {
  const normalized = hash.trim().toLowerCase();

  if (!TRANSACTION_HASH_PATTERN.test(normalized)) {
    throw new Error("Invalid transaction hash");
  }

  return normalized;
}

async function requireUniqueSlug(ctx: MutationCtx, slug: string) {
  const existing = await ctx.db
    .query("projects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (existing) {
    throw new Error("Project slug is already in use");
  }
}

async function requireOwnerProject(ctx: MutationCtx, id: Id<"projects">, ownerAddress: string) {
  const project = await ctx.db.get(id);

  if (!project) {
    throw new Error("Project not found");
  }

  if (project.ownerAddress !== normalizeAddress(ownerAddress)) {
    throw new Error("Connected wallet does not own this project");
  }

  return project;
}

export const listByOwner = query({
  args: { ownerAddress: v.string() },
  handler: async (ctx, args) => {
    const ownerAddress = normalizeAddress(args.ownerAddress);

    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerAddress", ownerAddress))
      .order("desc")
      .collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const getById = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createDraft = mutation({
  args: draftProjectArgs,
  handler: async (ctx, args) => {
    const now = Date.now();
    const ownerAddress = normalizeAddress(args.ownerAddress);
    const slug = args.slug.trim().toLowerCase();

    await requireUniqueSlug(ctx, slug);

    return await ctx.db.insert("projects", {
      name: args.name.trim(),
      slug,
      description: args.description.trim(),
      website: args.website?.trim() || undefined,
      metadataJson: args.metadataJson,
      metadataHash: args.metadataHash,
      ownerAddress,
      status: "draft",
      lastSyncAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markRegistrationPending = mutation({
  args: {
    id: v.id("projects"),
    ownerAddress: v.string(),
    registrationTxHash: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await requireOwnerProject(ctx, args.id, args.ownerAddress);

    if (
      project.status !== "draft" &&
      project.status !== "registration_error" &&
      project.status !== "stale"
    ) {
      throw new Error("Only draft, failed, or stale projects can start registration");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "pending_registration",
      registrationTxHash: normalizeTransactionHash(args.registrationTxHash),
      registrationError: undefined,
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const markRegistrationSynced = mutation({
  args: {
    id: v.id("projects"),
    ownerAddress: v.string(),
    registryProjectId: v.optional(v.number()),
    createdLedger: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await requireOwnerProject(ctx, args.id, args.ownerAddress);

    if (!project.registrationTxHash) {
      throw new Error("Project has no registration transaction to sync");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "registered",
      registryProjectId: args.registryProjectId,
      createdLedger: args.createdLedger,
      registrationError: undefined,
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const markRegistrationStale = mutation({
  args: {
    id: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwnerProject(ctx, args.id, args.ownerAddress);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "stale",
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const markRegistrationError = mutation({
  args: {
    id: v.id("projects"),
    ownerAddress: v.string(),
    registrationError: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwnerProject(ctx, args.id, args.ownerAddress);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "registration_error",
      registrationError: args.registrationError.slice(0, 500),
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const updateDraft = mutation({
  args: {
    id: v.id("projects"),
    ...draftProjectArgs,
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.status !== "draft") {
      throw new Error("Only draft projects can be updated in Sprint 2");
    }

    const ownerAddress = normalizeAddress(args.ownerAddress);
    if (project.ownerAddress !== ownerAddress) {
      throw new Error("Connected wallet does not own this project");
    }

    const slug = args.slug.trim().toLowerCase();
    if (slug !== project.slug) {
      await requireUniqueSlug(ctx, slug);
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      slug,
      description: args.description.trim(),
      website: args.website?.trim() || undefined,
      metadataJson: args.metadataJson,
      metadataHash: args.metadataHash,
      ownerAddress,
      updatedAt: Date.now(),
    });
  },
});
