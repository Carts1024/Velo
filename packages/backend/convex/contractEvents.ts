import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";

import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SCHEDULED_CONTRACTS = 100;
const MAX_SCHEDULED_PROJECTS = 20;
const STALE_AFTER_MS = 2 * 60 * 1_000;
const METADATA_HASH_PATTERN = /^[0-9a-f]{64}$/i;

type PollStatus = "live" | "polling" | "stale" | "error" | "empty";

function projectScope(projectId: Id<"projects">) {
  return `project:${projectId}`;
}

function normalizeOwnerAddress(address: string) {
  return address.trim().toUpperCase();
}

async function pollerForProject(ctx: QueryCtx, projectId: Id<"projects">) {
  return await ctx.db
    .query("pollerState")
    .withIndex("by_scope", (q) => q.eq("scope", projectScope(projectId)))
    .unique();
}

function publicPollStatus(poller: Doc<"pollerState"> | null, eventCount: number): PollStatus {
  if (!poller) {
    return eventCount > 0 ? "stale" : "empty";
  }

  if (poller.status === "polling" || poller.status === "error") {
    return poller.status;
  }

  if (!poller.lastRunAt || Date.now() - poller.lastRunAt > STALE_AFTER_MS) {
    return "stale";
  }

  return eventCount > 0 ? "live" : "empty";
}

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);

    if (!project || project.ownerAddress !== normalizeOwnerAddress(args.ownerAddress)) {
      return null;
    }

    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, args.limit ?? DEFAULT_PAGE_SIZE));
    const events = await ctx.db
      .query("contractEvents")
      .withIndex("by_project_ledger", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);
    const poller = await pollerForProject(ctx, args.projectId);

    return {
      events,
      poller: poller
        ? {
            status: publicPollStatus(poller, events.length),
            lastLedger: poller.lastLedger,
            lastRunAt: poller.lastRunAt,
            errorMessage: poller.errorMessage,
          }
        : {
            status: publicPollStatus(null, events.length),
            lastLedger: undefined,
            lastRunAt: undefined,
            errorMessage: undefined,
          },
    };
  },
});

export const listPublicBySlug = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim().toLowerCase()))
      .unique();

    if (
      !project ||
      project.status !== "registered" ||
      project.registryProjectId === undefined ||
      !METADATA_HASH_PATTERN.test(project.metadataHash.trim())
    ) {
      return [];
    }

    const contracts = await ctx.db
      .query("projectContracts")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .take(100);
    const activeContractIds = new Set(
      contracts
        .filter(
          (contract) =>
            contract.status === "active" &&
            contract.registryProjectId === project.registryProjectId,
        )
        .map((contract) => contract.contractId),
    );

    if (activeContractIds.size === 0) {
      return [];
    }

    const limit = Math.min(10, Math.max(1, args.limit ?? 5));
    const events = await ctx.db
      .query("contractEvents")
      .withIndex("by_project_ledger", (q) => q.eq("projectId", project._id))
      .order("desc")
      .take(50);

    return events
      .filter((event) => activeContractIds.has(event.contractId))
      .slice(0, limit)
      .map((event) => ({
        eventId: event.eventId,
        contractId: event.contractId,
        transactionHash: event.transactionHash,
        ledger: event.ledger,
        timestamp: event.timestamp,
        topic: event.topic,
        type: event.type,
        decoded: event.decoded,
        observedAt: event.observedAt,
      }));
  },
});

export const getPollTarget = internalQuery({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerAddress !== normalizeOwnerAddress(args.ownerAddress)) {
      throw new Error("Connected wallet does not own this project");
    }

    if (project.status !== "registered") {
      throw new Error("Only registered projects can poll contract events");
    }

    const contracts = await ctx.db
      .query("projectContracts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(100);
    const poller = await pollerForProject(ctx, args.projectId);

    return {
      contractIds: contracts
        .filter((contract) => contract.status === "active")
        .map((contract) => contract.contractId),
      lastLedger: poller?.lastLedger,
    };
  },
});

export const listScheduledTargets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const activeContracts = await ctx.db
      .query("projectContracts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(MAX_SCHEDULED_CONTRACTS);
    const contractIdsByProject = new Map<Id<"projects">, string[]>();

    for (const contract of activeContracts) {
      const contractIds = contractIdsByProject.get(contract.projectId) ?? [];
      if (contractIds.length < 20) {
        contractIds.push(contract.contractId);
        contractIdsByProject.set(contract.projectId, contractIds);
      }
    }

    const targets = [];
    for (const [projectId, contractIds] of Array.from(contractIdsByProject).slice(
      0,
      MAX_SCHEDULED_PROJECTS,
    )) {
      const project = await ctx.db.get(projectId);
      if (!project || project.status !== "registered") {
        continue;
      }

      const poller = await pollerForProject(ctx, projectId);
      targets.push({
        projectId,
        contractIds,
        lastLedger: poller?.lastLedger,
      });
    }

    return targets;
  },
});

export const markPolling = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const scope = projectScope(args.projectId);
    const existing = await ctx.db
      .query("pollerState")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .unique();
    const value = {
      scope,
      projectId: args.projectId,
      status: "polling" as const,
      errorMessage: undefined,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
      return;
    }

    await ctx.db.insert("pollerState", value);
  },
});

export const storePollResult = internalMutation({
  args: {
    projectId: v.id("projects"),
    latestLedger: v.optional(v.number()),
    events: v.array(
      v.object({
        eventId: v.string(),
        contractId: v.string(),
        transactionHash: v.string(),
        ledger: v.number(),
        timestamp: v.optional(v.number()),
        topic: v.string(),
        topics: v.array(v.any()),
        type: v.string(),
        raw: v.any(),
        decoded: v.optional(v.any()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const observedAt = Date.now();

    for (const event of args.events) {
      const eventKey = `${args.projectId}:${event.eventId}`;
      const existing = await ctx.db
        .query("contractEvents")
        .withIndex("by_event_key", (q) => q.eq("eventKey", eventKey))
        .unique();
      const value = { ...event, eventKey, projectId: args.projectId, observedAt };

      if (existing) {
        await ctx.db.patch(existing._id, value);
      } else {
        await ctx.db.insert("contractEvents", value);
      }
    }

    const scope = projectScope(args.projectId);
    const poller = await ctx.db
      .query("pollerState")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .unique();
    const state = {
      scope,
      projectId: args.projectId,
      status: "idle" as const,
      lastLedger: args.latestLedger,
      lastRunAt: observedAt,
      errorMessage: undefined,
      updatedAt: observedAt,
    };

    if (poller) {
      await ctx.db.patch(poller._id, state);
    } else {
      await ctx.db.insert("pollerState", state);
    }
  },
});

export const markPollError = internalMutation({
  args: {
    projectId: v.id("projects"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = projectScope(args.projectId);
    const existing = await ctx.db
      .query("pollerState")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .unique();
    const value = {
      scope,
      projectId: args.projectId,
      status: "error" as const,
      lastRunAt: Date.now(),
      errorMessage: args.message.slice(0, 500),
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
    } else {
      await ctx.db.insert("pollerState", value);
    }
  },
});
