import { v } from "convex/values";

import { query } from "../_generated/server";
import { activeContractsForProject } from "../project_contracts/helpers";
import {
  METADATA_HASH_PATTERN,
  normalizeAddress,
  ownerProjectOrNull,
  requireIdentity,
  requireOwnerProject,
  safeWebsite,
} from "./helpers";

export const listByOwner = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const tokenProjects = await ctx.db
      .query("projects")
      .withIndex("by_owner_token_identifier", (q) =>
        q.eq("ownerTokenIdentifier", identity.tokenIdentifier),
      )
      .order("desc")
      .collect();

    const legacyProjects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerAddress", normalizeAddress(identity.subject)))
      .order("desc")
      .collect();

    const tokenProjectIds = new Set(tokenProjects.map((project) => project._id));
    return [
      ...tokenProjects,
      ...legacyProjects.filter(
        (project) => !project.ownerTokenIdentifier && !tokenProjectIds.has(project._id),
      ),
    ];
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
  },
  handler: async (ctx, args) => {
    return await ownerProjectOrNull(ctx, args.id);
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

export const verifyApiKeyAndGetEvents = query({
  args: {
    apiKeyHash: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.apiKeyHash))
      .unique();

    if (!apiKey || apiKey.revoked) {
      return { authorized: false };
    }

    const project = await ctx.db.get(apiKey.projectId);
    if (!project) {
      return { authorized: false };
    }

    const limit = Math.min(100, Math.max(1, args.limit ?? 20));
    const events = await ctx.db
      .query("contractEvents")
      .withIndex("by_project_ledger", (q) => q.eq("projectId", project._id))
      .order("desc")
      .take(limit);

    return {
      authorized: true,
      project: {
        id: project._id,
        name: project.name,
        slug: project.slug,
      },
      events,
    };
  },
});

export const verifyApiKeyAndGetTransaction = query({
  args: {
    apiKeyHash: v.string(),
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.apiKeyHash))
      .unique();

    if (!apiKey || apiKey.revoked) {
      return { authorized: false };
    }

    const project = await ctx.db.get(apiKey.projectId);
    if (!project) {
      return { authorized: false };
    }

    const transaction = await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash.trim().toLowerCase()))
      .unique();

    return {
      authorized: true,
      transaction,
    };
  },
});

export const verifyApiKeyAndGetWebhookDeliveries = query({
  args: {
    apiKeyHash: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.apiKeyHash))
      .unique();

    if (!apiKey || apiKey.revoked) {
      return { authorized: false };
    }

    const project = await ctx.db.get(apiKey.projectId);
    if (!project) {
      return { authorized: false };
    }

    const limit = Math.min(100, Math.max(1, args.limit ?? 20));
    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_project_created_at", (q) => q.eq("projectId", project._id))
      .order("desc")
      .take(limit);

    return {
      authorized: true,
      deliveries,
    };
  },
});

export const listApiKeys = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireOwnerProject(ctx, args.projectId);

    return await ctx.db
      .query("apiKeys")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

/**
 * Verifies an API key and returns the project data needed for payment intent creation.
 * Used by the POST /api/v1/payment-intents API route.
 */
export const verifyApiKeyAndGetProject = query({
  args: {
    apiKeyHash: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.apiKeyHash))
      .unique();

    if (!apiKey || apiKey.revoked) {
      return { authorized: false };
    }

    const project = await ctx.db.get(apiKey.projectId);
    if (!project) {
      return { authorized: false };
    }

    if (!project.paymentAccessActive) {
      return { authorized: false, reason: "payment_access_inactive" };
    }

    return {
      authorized: true,
      project: {
        _id: project._id,
        name: project.name,
        slug: project.slug,
        ownerAddress: project.ownerAddress,
        paymentAccessActive: project.paymentAccessActive,
      },
    };
  },
});
