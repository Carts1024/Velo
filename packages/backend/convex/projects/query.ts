import { v } from "convex/values";

import { query } from "../_generated/server";
import { activeContractsForProject } from "../project_contracts/helpers";
import {
  METADATA_HASH_PATTERN,
  normalizeAddress,
  ownerProjectOrNull,
  safeWebsite,
} from "./helpers";

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
  args: {
    id: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    return await ownerProjectOrNull(ctx, args.id, args.ownerAddress);
  },
});

export const getPublicVerification = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim().toLowerCase()))
      .unique();

    if (!project) {
      return null;
    }

    const activeContracts = await activeContractsForProject(ctx, project._id);
    const hasMismatch =
      project.status !== "registered" ||
      project.registryProjectId === undefined ||
      !METADATA_HASH_PATTERN.test(project.metadataHash.trim()) ||
      activeContracts.some((contract) => contract.registryProjectId !== project.registryProjectId);

    return {
      name: project.name,
      slug: project.slug,
      description: project.description,
      website: safeWebsite(project.website),
      ownerAddress: project.ownerAddress,
      status: project.status,
      active: project.status === "registered" && !hasMismatch,
      registryProjectId: project.registryProjectId,
      metadataHash: project.metadataHash,
      officialContractIds: hasMismatch
        ? []
        : activeContracts.map((contract) => contract.contractId),
      createdLedger: project.createdLedger,
      lastSyncAt: project.lastSyncAt,
      mismatch: hasMismatch,
    };
  },
});
