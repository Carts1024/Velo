import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { projectScope } from "./helpers";

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
    const now = Date.now();
    const value = {
      scope,
      projectId: args.projectId,
      status: "error" as const,
      lastRunAt: now,
      errorMessage: args.message.slice(0, 500),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
    } else {
      await ctx.db.insert("pollerState", value);
    }
  },
});
