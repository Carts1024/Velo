import { assertValidContractId } from "@repo/stellar";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{64}$/i;
const METADATA_HASH_PATTERN = /^[0-9a-f]{64}$/i;

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

function normalizeContractId(contractId: string) {
  return assertValidContractId(contractId);
}

function safeWebsite(website?: string) {
  if (!website) {
    return undefined;
  }

  try {
    const url = new URL(website);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
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

async function ownerProjectOrNull(ctx: QueryCtx, id: Id<"projects">, ownerAddress: string) {
  const project = await ctx.db.get(id);

  if (!project || project.ownerAddress !== normalizeAddress(ownerAddress)) {
    return null;
  }

  return project;
}

async function requireRegisteredOwnerProject(
  ctx: MutationCtx,
  id: Id<"projects">,
  ownerAddress: string,
) {
  const project = await requireOwnerProject(ctx, id, ownerAddress);

  if (project.status !== "registered" || project.registryProjectId === undefined) {
    throw new Error("Only registered projects can manage official contracts");
  }

  return project;
}

async function activeContractsForProject(ctx: QueryCtx, projectId: Id<"projects">) {
  const contracts = await ctx.db
    .query("projectContracts")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(100);

  return contracts.filter(
    (contract) =>
      contract.status === "active" ||
      contract.status === "pending_remove" ||
      (contract.status === "contract_error" && contract.confirmedLedger !== undefined),
  );
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
  args: {
    id: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    return await ownerProjectOrNull(ctx, args.id, args.ownerAddress);
  },
});

export const listContracts = query({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await ownerProjectOrNull(ctx, args.projectId, args.ownerAddress))) {
      return [];
    }

    return await ctx.db
      .query("projectContracts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(100);
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

export const markContractAddPending = mutation({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
    contractId: v.string(),
    transactionHash: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await requireRegisteredOwnerProject(ctx, args.projectId, args.ownerAddress);
    const registryProjectId = project.registryProjectId;

    if (registryProjectId === undefined) {
      throw new Error("Registered project is missing registry project ID");
    }

    const contractId = normalizeContractId(args.contractId);
    const existing = await ctx.db
      .query("projectContracts")
      .withIndex("by_project_contract", (q) =>
        q.eq("projectId", args.projectId).eq("contractId", contractId),
      )
      .unique();
    const now = Date.now();
    const patch = {
      ownerAddress: project.ownerAddress,
      registryProjectId,
      status: "pending_add" as const,
      addTxHash: normalizeTransactionHash(args.transactionHash),
      removeTxHash: undefined,
      error: undefined,
      lastSyncAt: now,
      updatedAt: now,
    };

    if (existing) {
      if (
        existing.status === "active" ||
        existing.status === "pending_add" ||
        existing.status === "pending_remove"
      ) {
        throw new Error("Contract is already linked to this project");
      }

      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("projectContracts", {
      projectId: args.projectId,
      contractId,
      ...patch,
      createdAt: now,
    });
  },
});

export const markContractAddConfirmed = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
    confirmedLedger: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.id);

    if (!contract) {
      throw new Error("Contract link not found");
    }

    if (contract.ownerAddress !== normalizeAddress(args.ownerAddress)) {
      throw new Error("Connected wallet does not own this contract link");
    }

    if (contract.status !== "pending_add") {
      throw new Error("Only pending additions can be confirmed");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      error: undefined,
      confirmedLedger: args.confirmedLedger,
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const markContractRemovePending = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
    transactionHash: v.string(),
  },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.id);

    if (!contract) {
      throw new Error("Contract link not found");
    }

    if (contract.ownerAddress !== normalizeAddress(args.ownerAddress)) {
      throw new Error("Connected wallet does not own this contract link");
    }

    if (
      contract.status !== "active" &&
      !(contract.status === "contract_error" && contract.confirmedLedger !== undefined)
    ) {
      throw new Error("Only active or failed contract links can be removed");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "pending_remove",
      removeTxHash: normalizeTransactionHash(args.transactionHash),
      error: undefined,
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const markContractRemoved = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.id);

    if (!contract) {
      throw new Error("Contract link not found");
    }

    if (contract.ownerAddress !== normalizeAddress(args.ownerAddress)) {
      throw new Error("Connected wallet does not own this contract link");
    }

    if (contract.status !== "pending_remove") {
      throw new Error("Only pending removals can be confirmed");
    }

    await ctx.db.delete(args.id);
  },
});

export const markContractStale = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.id);

    if (!contract) {
      throw new Error("Contract link not found");
    }

    if (contract.ownerAddress !== normalizeAddress(args.ownerAddress)) {
      throw new Error("Connected wallet does not own this contract link");
    }

    if (contract.status !== "pending_add" && contract.status !== "pending_remove") {
      throw new Error("Only pending contract updates can become stale");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "stale",
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const markContractError = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.id);

    if (!contract) {
      throw new Error("Contract link not found");
    }

    if (contract.ownerAddress !== normalizeAddress(args.ownerAddress)) {
      throw new Error("Connected wallet does not own this contract link");
    }

    if (
      contract.status !== "pending_add" &&
      contract.status !== "pending_remove" &&
      contract.status !== "stale"
    ) {
      throw new Error("Only pending or stale contract updates can fail");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "contract_error",
      error: args.error.slice(0, 500),
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});
