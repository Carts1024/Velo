import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";

import { internalAction, internalMutation } from "../_generated/server";

const claimRef = makeFunctionReference<"mutation">("provider_events/processing:claimOne");
const quarantineRef = makeFunctionReference<"mutation">(
  "provider_events/processing:quarantineHint",
);
const claimDuePageRef = makeFunctionReference<"mutation">(
  "provider_events/processing:claimDuePage",
);
const drainRef = makeFunctionReference<"action">("provider_events/processing:drain");

export const claimOne = internalMutation({
  args: { eventId: v.id("providerEvents"), leaseToken: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.processingState !== "pending") return null;
    const generation = (event.leaseGeneration ?? 0) + 1;
    await ctx.db.patch(event._id, {
      processingState: "leased",
      leaseToken: args.leaseToken,
      leaseGeneration: generation,
      leaseExpiresAt: Date.now() + 8_500,
      attemptCount: (event.attemptCount ?? 0) + 1,
    });
    return { event, generation };
  },
});

export const claimDuePage = internalMutation({
  args: { leaseToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = Math.min(args.limit ?? 100, 100);
    const pending = await ctx.db
      .query("providerEvents")
      .withIndex("by_processing_state_and_next_attempt_at", (q) =>
        q.eq("processingState", "pending").lte("nextAttemptAt", now),
      )
      .take(limit);
    const expired =
      pending.length < limit
        ? await ctx.db
            .query("providerEvents")
            .withIndex("by_processing_state_and_lease_expires_at", (q) =>
              q.eq("processingState", "leased").lte("leaseExpiresAt", now),
            )
            .take(limit - pending.length)
        : [];
    const claimed = [];
    for (const event of [...pending, ...expired]) {
      const generation = (event.leaseGeneration ?? 0) + 1;
      await ctx.db.patch(event._id, {
        processingState: "leased",
        leaseToken: args.leaseToken,
        leaseGeneration: generation,
        leaseExpiresAt: now + 8_500,
        attemptCount: (event.attemptCount ?? 0) + 1,
      });
      claimed.push({ eventId: event._id, generation });
    }
    return claimed;
  },
});

export const quarantineHint = internalMutation({
  args: {
    eventId: v.id("providerEvents"),
    leaseToken: v.string(),
    leaseGeneration: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (
      !event ||
      event.processingState !== "leased" ||
      event.leaseToken !== args.leaseToken ||
      event.leaseGeneration !== args.leaseGeneration
    )
      return false;
    await ctx.db.patch(event._id, {
      processingState: "quarantined",
      quarantineReason: "awaiting_provider_corroboration",
      leaseToken: undefined,
      leaseExpiresAt: undefined,
    });
    return true;
  },
});

export const processOne = internalAction({
  args: { eventId: v.id("providerEvents") },
  handler: async (ctx, args) => {
    const leaseToken = crypto.randomUUID();
    const claim = (await ctx.runMutation(claimRef, { eventId: args.eventId, leaseToken })) as {
      generation: number;
    } | null;
    if (!claim) return { processed: false };
    // Callback is unsigned: persist it as a hint, but require a later authenticated
    // provider lookup before any terminal financial transition.
    await ctx.runMutation(quarantineRef, {
      eventId: args.eventId,
      leaseToken,
      leaseGeneration: claim.generation,
    });
    return { processed: true, corroborated: false };
  },
});

export const drain = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 100);
    const leaseToken = crypto.randomUUID();
    const claimed = (await ctx.runMutation(claimDuePageRef, {
      leaseToken,
      limit,
    })) as Array<{ eventId: Id<"providerEvents">; generation: number }>;
    for (let offset = 0; offset < claimed.length; offset += 10) {
      await Promise.all(
        claimed.slice(offset, offset + 10).map(async ({ eventId, generation }) => {
          await ctx.runMutation(quarantineRef, {
            eventId,
            leaseToken,
            leaseGeneration: generation,
          });
        }),
      );
    }
    if (claimed.length === limit) await ctx.scheduler.runAfter(0, drainRef, { limit });
    return { claimed: claimed.length };
  },
});
