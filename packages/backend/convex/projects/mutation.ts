import { v } from "convex/values";

import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import {
  draftProjectArgs,
  normalizeAddress,
  normalizeTransactionHash,
  requireOwnerProject,
  requireUniqueSlug,
} from "./helpers";

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

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: args.id,
      eventType: "project.registered",
    });

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: args.id,
      eventType: "transaction.succeeded",
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

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: args.id,
      eventType: "transaction.failed",
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

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: args.id,
      eventType: "project.updated",
    });
  },
});

export const generateApiKey = mutation({
  args: {
    id: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwnerProject(ctx, args.id, args.ownerAddress);

    // Generate secure random API key token: tk_live_<32 hex chars>
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const token = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const rawKey = `tk_live_${token}`;

    // Hash the rawKey using SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      apiKeyHash,
      apiKeyPrefix: `tk_live_${token.slice(0, 4)}...${token.slice(-4)}`,
      apiKeyCreatedAt: now,
      updatedAt: now,
    });

    return { rawKey };
  },
});

export const revokeApiKey = mutation({
  args: {
    id: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwnerProject(ctx, args.id, args.ownerAddress);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      apiKeyHash: undefined,
      apiKeyPrefix: undefined,
      apiKeyCreatedAt: undefined,
      updatedAt: now,
    });
  },
});
