import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { storePollSuccess } from "../poller_state/helpers";

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

    await storePollSuccess(ctx, args.projectId, args.latestLedger, observedAt);
  },
});
