import { v } from "convex/values";

import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { ProjectId } from "./types";
import type { UserIdentity } from "convex/server";

const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{64}$/i;
export const METADATA_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export const draftProjectArgs = {
  name: v.string(),
  slug: v.string(),
  description: v.string(),
  website: v.optional(v.string()),
  metadataJson: v.string(),
  metadataHash: v.string(),
  ownerAddress: v.string(),
  defaultPaymentAnchor: v.optional(v.union(v.literal("inhouse"), v.literal("pdax"))),
};

export function normalizeAddress(address: string) {
  return address.trim().toUpperCase();
}

export async function requireIdentity(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Not authenticated");
  }

  return identity;
}

function identityOwnerAddress(identity: UserIdentity) {
  if (typeof identity.subject !== "string") {
    return null;
  }

  try {
    return normalizeAddress(identity.subject);
  } catch {
    return null;
  }
}

export function normalizeTransactionHash(hash: string) {
  const normalized = hash.trim().toLowerCase();

  if (!TRANSACTION_HASH_PATTERN.test(normalized)) {
    throw new Error("Invalid transaction hash");
  }

  return normalized;
}

export function safeWebsite(website?: string) {
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

export async function requireUniqueSlug(ctx: MutationCtx, slug: string) {
  const existing = await ctx.db
    .query("projects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (existing) {
    throw new Error("Project slug is already in use");
  }
}

export async function requireProjectOwnerByToken(
  ctx: QueryCtx | MutationCtx,
  id: ProjectId,
  ownerTokenIdentifier: string,
  ownerSubject: string,
) {
  const project = await ctx.db.get(id);

  if (!project) {
    throw new Error("Project not found");
  }

  if (project.ownerTokenIdentifier === ownerTokenIdentifier) {
    return project;
  }

  if (project.ownerTokenIdentifier) {
    throw new Error("Unauthorized");
  }

  if (project.ownerAddress !== normalizeAddress(ownerSubject)) {
    throw new Error("Unauthorized");
  }

  if ("patch" in ctx.db) {
    await (ctx as MutationCtx).db.patch(id, { ownerTokenIdentifier });
  }

  return { ...project, ownerTokenIdentifier };
}

export async function requireProjectOwner(ctx: QueryCtx | MutationCtx, id: ProjectId) {
  const identity = await requireIdentity(ctx);
  const project = await ctx.db.get(id);

  if (!project) {
    throw new Error("Project not found");
  }

  if (project.ownerTokenIdentifier === identity.tokenIdentifier) {
    return project;
  }

  if (project.ownerTokenIdentifier) {
    throw new Error("Unauthorized");
  }

  if (project.ownerAddress !== identityOwnerAddress(identity)) {
    throw new Error("Unauthorized");
  }

  if ("patch" in ctx.db) {
    await (ctx as MutationCtx).db.patch(id, { ownerTokenIdentifier: identity.tokenIdentifier });
  }

  return { ...project, ownerTokenIdentifier: identity.tokenIdentifier };
}

export async function projectOwnerOrNull(ctx: QueryCtx | MutationCtx, id: ProjectId) {
  const identity = await requireIdentity(ctx);
  const project = await ctx.db.get(id);

  if (!project) {
    return null;
  }

  if (project.ownerTokenIdentifier === identity.tokenIdentifier) {
    return project;
  }

  if (project.ownerTokenIdentifier) {
    return null;
  }

  if (project.ownerAddress !== identityOwnerAddress(identity)) {
    return null;
  }

  if ("patch" in ctx.db) {
    await (ctx as MutationCtx).db.patch(id, { ownerTokenIdentifier: identity.tokenIdentifier });
  }

  return { ...project, ownerTokenIdentifier: identity.tokenIdentifier };
}

export async function requireOwnerProject(ctx: QueryCtx | MutationCtx, id: ProjectId) {
  const project = await requireProjectOwner(ctx, id);

  return project;
}

export async function ownerProjectOrNull(ctx: QueryCtx | MutationCtx, id: ProjectId) {
  return await projectOwnerOrNull(ctx, id);
}
