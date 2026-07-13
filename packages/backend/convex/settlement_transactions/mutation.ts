import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

export const create = internalMutation({
  args: {
    projectId: v.id("projects"),
    paymentIntentId: v.optional(v.id("paymentIntents")),
    provider: v.literal("pdax"),
    status: v.union(
      v.literal("QUOTE_PENDING"),
      v.literal("QUOTE_FIRM"),
      v.literal("TRADE_EXECUTED"),
      v.literal("PAYOUT_PENDING"),
      v.literal("PAYOUT_SUCCEEDED"),
      v.literal("PAYOUT_FAILED"),
    ),
    idempotencyId: v.string(),
    quoteId: v.optional(v.string()),
    orderId: v.optional(v.number()),
    withdrawalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settlementTransactions")
      .withIndex("by_project_and_idempotency", (q) =>
        q.eq("projectId", args.projectId).eq("idempotencyId", args.idempotencyId),
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("settlementTransactions", {
      projectId: args.projectId,
      paymentIntentId: args.paymentIntentId,
      provider: args.provider,
      status: args.status,
      idempotencyId: args.idempotencyId,
      quoteId: args.quoteId,
      orderId: args.orderId,
      withdrawalId: args.withdrawalId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    idempotencyId: v.string(),
    status: v.union(
      v.literal("QUOTE_PENDING"),
      v.literal("QUOTE_FIRM"),
      v.literal("TRADE_EXECUTED"),
      v.literal("PAYOUT_PENDING"),
      v.literal("PAYOUT_SUCCEEDED"),
      v.literal("PAYOUT_FAILED"),
    ),
    orderId: v.optional(v.number()),
    withdrawalId: v.optional(v.string()),
    tradeDetails: v.optional(
      v.object({
        orderId: v.number(),
        price: v.number(),
        amount: v.number(),
        quantity: v.number(),
        status: v.string(),
      }),
    ),
    withdrawalDetails: v.optional(
      v.object({
        referenceNumber: v.optional(v.string()),
        amount: v.number(),
        fee: v.number(),
        status: v.string(),
        bankCode: v.string(),
        accountName: v.string(),
        accountNumber: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = args.projectId
      ? await ctx.db
          .query("settlementTransactions")
          .withIndex("by_project_and_idempotency", (q) =>
            q.eq("projectId", args.projectId!).eq("idempotencyId", args.idempotencyId),
          )
          .unique()
      : await ctx.db
          .query("settlementTransactions")
          .withIndex("by_idempotency", (q) => q.eq("idempotencyId", args.idempotencyId))
          .unique();

    if (!existing) {
      throw new Error(`Settlement transaction not found: ${args.idempotencyId}`);
    }

    const terminal = new Set(["PAYOUT_SUCCEEDED", "PAYOUT_FAILED"]);
    if (terminal.has(existing.status) && args.status !== existing.status) {
      throw new Error(
        `Invalid terminal settlement transition: ${existing.status} -> ${args.status}`,
      );
    }
    if (
      (existing.status === "PAYOUT_SUCCEEDED" || existing.status === "PAYOUT_FAILED") &&
      args.status === "PAYOUT_PENDING"
    ) {
      throw new Error(`Stale settlement transition rejected: ${existing.status} -> ${args.status}`);
    }

    const patchPayload: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.orderId !== undefined) patchPayload.orderId = args.orderId;
    if (args.withdrawalId !== undefined) patchPayload.withdrawalId = args.withdrawalId;
    if (args.tradeDetails !== undefined) patchPayload.tradeDetails = args.tradeDetails;
    if (args.withdrawalDetails !== undefined)
      patchPayload.withdrawalDetails = args.withdrawalDetails;

    await ctx.db.patch(existing._id, patchPayload);
    return existing._id;
  },
});
