import { v } from "convex/values";

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { ProjectId } from "./types";

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
};

export function normalizeAddress(address: string) {
  return address.trim().toUpperCase();
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

export async function requireOwnerProject(
  ctx: QueryCtx | MutationCtx,
  id: ProjectId,
  ownerAddress: string,
) {
  const project = await ctx.db.get(id);

  if (!project) {
    throw new Error("Project not found");
  }

  if (project.ownerAddress !== normalizeAddress(ownerAddress)) {
    throw new Error("Connected wallet does not own this project");
  }

  return project;
}

export async function ownerProjectOrNull(ctx: QueryCtx, id: ProjectId, ownerAddress: string) {
  const project = await ctx.db.get(id);

  if (!project || project.ownerAddress !== normalizeAddress(ownerAddress)) {
    return null;
  }

  return project;
}
