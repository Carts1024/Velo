import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

// Ten seconds drains in-flight action work; 3.334 seconds is the maximum time
// either exact bucket needs to replenish from empty to full capacity.
export const RATE_LIMIT_CUTOVER_DRAIN_MS = 13_334;

const stableBackendValidator = v.union(v.literal("convex"), v.literal("upstash"));

export const begin = internalMutation({
  args: {
    projectId: v.id("projects"),
    targetBackend: stableBackendValidator,
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const currentBackend = project.rateLimitBackend ?? "convex";
    if (currentBackend === args.targetBackend) {
      return { status: "already_complete" as const, backend: currentBackend };
    }
    if (currentBackend === "migrating") {
      return { status: "already_migrating" as const };
    }
    const now = Date.now();
    await ctx.db.patch(args.projectId, { rateLimitBackend: "migrating", updatedAt: now });
    await ctx.scheduler.runAfter(RATE_LIMIT_CUTOVER_DRAIN_MS, internal.rate_limits.cutover.finish, {
      projectId: args.projectId,
      sourceBackend: currentBackend,
      targetBackend: args.targetBackend,
    });
    return {
      status: "migrating" as const,
      sourceBackend: currentBackend,
      targetBackend: args.targetBackend,
      finishAfter: now + RATE_LIMIT_CUTOVER_DRAIN_MS,
    };
  },
});

export const finish = internalMutation({
  args: {
    projectId: v.id("projects"),
    sourceBackend: stableBackendValidator,
    targetBackend: stableBackendValidator,
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (project.rateLimitBackend !== "migrating") {
      return { status: "cancelled" as const, backend: project.rateLimitBackend ?? "convex" };
    }
    await ctx.db.patch(args.projectId, {
      rateLimitBackend: args.targetBackend,
      updatedAt: Date.now(),
    });
    return {
      status: "complete" as const,
      sourceBackend: args.sourceBackend,
      targetBackend: args.targetBackend,
    };
  },
});

export const abort = internalMutation({
  args: {
    projectId: v.id("projects"),
    restoreBackend: stableBackendValidator,
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (project.rateLimitBackend !== "migrating") {
      throw new Error("Project is not migrating");
    }
    await ctx.db.patch(args.projectId, {
      rateLimitBackend: args.restoreBackend,
      updatedAt: Date.now(),
    });
    return { status: "aborted" as const, backend: args.restoreBackend };
  },
});
