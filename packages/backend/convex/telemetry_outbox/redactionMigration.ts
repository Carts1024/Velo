import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

/** Widen/migrate step. Run repeatedly until both counts reach zero, then narrow later. */
export const normalizeLegacyDiagnostics = internalMutation({
  args: {
    limit: v.optional(v.number()),
    eventCursor: v.optional(v.string()),
    operationCursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 100);
    const eventPage = await ctx.db
      .query("providerEvents")
      .paginate({ numItems: limit, cursor: args.eventCursor ?? null });
    const events = eventPage.page;
    let normalizedEvents = 0;
    for (const event of events) {
      if (event.eventSummary || !event.processed) continue;
      await ctx.db.patch(event._id, {
        eventSummary: {
          eventType: event.type,
          eventId: event.eventId,
          ...(event.payloadDigest ? { payloadDigest: event.payloadDigest } : {}),
        },
        rawEvent: undefined,
      });
      normalizedEvents += 1;
    }
    const operationPage = await ctx.db.query("providerOperations").paginate({
      numItems: limit,
      cursor: args.operationCursor ?? null,
    });
    const operations = operationPage.page;
    let normalizedOperations = 0;
    for (const operation of operations) {
      if (
        operation.responseSummary ||
        !["succeeded", "failed", "dead_letter"].includes(operation.state)
      )
        continue;
      await ctx.db.patch(operation._id, {
        responseSummary: {
          status: operation.state,
          ...(operation.providerReference
            ? { providerReference: operation.providerReference }
            : {}),
        },
        errorCode: operation.errorMessage ? "dependency_unavailable" : undefined,
        resultJson: undefined,
        errorMessage: undefined,
        ...(operation.state === "succeeded" ? { requestJson: undefined } : {}),
      });
      normalizedOperations += 1;
    }
    return {
      normalizedEvents,
      normalizedOperations,
      eventCursor: eventPage.continueCursor,
      operationCursor: operationPage.continueCursor,
      eventsDone: eventPage.isDone,
      operationsDone: operationPage.isDone,
    };
  },
});

export const verifyNoLegacyDiagnostics = internalMutation({
  args: {
    limit: v.optional(v.number()),
    eventCursor: v.optional(v.string()),
    operationCursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 100);
    const eventPage = await ctx.db
      .query("providerEvents")
      .paginate({ numItems: limit, cursor: args.eventCursor ?? null });
    const operationPage = await ctx.db
      .query("providerOperations")
      .paginate({ numItems: limit, cursor: args.operationCursor ?? null });
    const events = eventPage.page;
    const operations = operationPage.page;
    return {
      providerEvents: events.filter((event) => event.processed && event.rawEvent !== undefined)
        .length,
      providerOperations: operations.filter(
        (operation) =>
          ["succeeded", "failed", "dead_letter"].includes(operation.state) &&
          (operation.resultJson !== undefined || operation.errorMessage !== undefined),
      ).length,
      eventCursor: eventPage.continueCursor,
      operationCursor: operationPage.continueCursor,
      isDone: eventPage.isDone && operationPage.isDone,
    };
  },
});
