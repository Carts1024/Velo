import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";

export const getByEventId = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("providerEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();
  },
});

export const recordEvent = internalMutation({
  args: {
    projectId: v.id("projects"),
    provider: v.literal("pdax"),
    eventId: v.string(),
    type: v.union(v.literal("DEPOSIT"), v.literal("WITHDRAWAL"), v.literal("TRADE")),
    rawEvent: v.string(),
    processed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (existing) {
      return { id: existing._id, alreadyRecorded: true };
    }

    const id = await ctx.db.insert("providerEvents", {
      projectId: args.projectId,
      provider: args.provider,
      eventId: args.eventId,
      type: args.type,
      rawEvent: args.rawEvent,
      processed: args.processed,
      createdAt: Date.now(),
    });

    return { id, alreadyRecorded: false };
  },
});

export const markProcessed = internalMutation({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (!existing) {
      throw new Error(`Provider event not found: ${args.eventId}`);
    }

    await ctx.db.patch(existing._id, { processed: true });
    return existing._id;
  },
});
