import { v } from "convex/values";

import { mutation, query, type MutationCtx } from "./_generated/server";

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

async function requireUniqueSlug(ctx: MutationCtx, slug: string) {
  const existing = await ctx.db
    .query("projects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (existing) {
    throw new Error("Project slug is already in use");
  }
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
      createdAt: now,
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
