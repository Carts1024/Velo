import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";

const processOneRef = makeFunctionReference<"action">("provider_events/processing:processOne");

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

    await ctx.db.patch(existing._id, { processed: true, processingState: "processed" });
    return existing._id;
  },
});

export const ingestPdax = internalMutation({
  args: {
    eventId: v.string(),
    identifier: v.string(),
    type: v.union(v.literal("DEPOSIT"), v.literal("WITHDRAWAL"), v.literal("TRADE")),
    rawEvent: v.string(),
    payloadDigest: v.string(),
  },
  handler: async (ctx, args) => {
    const byId = await ctx.db
      .query("providerEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (byId) return { status: "duplicate" as const, eventId: byId.eventId };
    const byDigest = await ctx.db
      .query("providerEvents")
      .withIndex("by_payload_digest", (q) => q.eq("payloadDigest", args.payloadDigest))
      .unique();
    if (byDigest) return { status: "duplicate" as const, eventId: byDigest.eventId };

    const transaction = await ctx.db
      .query("settlementTransactions")
      .withIndex("by_withdrawal_id", (q) => q.eq("withdrawalId", args.identifier))
      .unique();
    const operation = await ctx.db
      .query("providerOperations")
      .withIndex("by_provider_and_provider_key", (q) =>
        q.eq("provider", "pdax").eq("providerKey", args.identifier),
      )
      .unique();
    const projectId = transaction?.projectId ?? operation?.projectId;
    const now = Date.now();
    const id = await ctx.db.insert("providerEvents", {
      ...(projectId ? { projectId } : {}),
      provider: "pdax",
      eventId: args.eventId,
      type: args.type,
      rawEvent: args.rawEvent,
      payloadDigest: args.payloadDigest,
      processed: false,
      // Unsigned PDAX callbacks are hints. A worker/provider lookup must corroborate terminal state.
      processingState: projectId ? "pending" : "quarantined",
      ...(projectId ? {} : { quarantineReason: "unmatched_provider_identifier" }),
      attemptCount: 0,
      nextAttemptAt: now,
      leaseGeneration: 0,
      createdAt: now,
    });
    if (projectId) {
      await ctx.scheduler.runAfter(0, processOneRef, { eventId: id });
    }
    return { status: projectId ? ("accepted" as const) : ("quarantined" as const), id };
  },
});

export const getById = internalQuery({
  args: { id: v.id("providerEvents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
