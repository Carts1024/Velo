import { v, ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";
import {
  createPaymentIntentFingerprint,
  mapAssetToPdax,
  PAYMENT_INTENT_EXPIRY_MS,
  STATUS_TRANSITIONS,
  resolvePaymentAnchor,
  verifyApiKeyForPayments,
} from "./helpers";

/**
 * Creates a new payment intent. Requires apiKeyHash for authentication.
 */
export const createPaymentIntent = mutation({
  args: {
    apiKeyHash: v.string(),
    correlationId: v.optional(v.string()),
    amount: v.string(),
    asset: v.string(),
    description: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    anchor: v.optional(v.union(v.literal("inhouse"), v.literal("pdax"))),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate using API key hash
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.apiKeyHash))
      .unique();

    if (!apiKey || apiKey.revoked) {
      throw new ConvexError("Unauthorized: Invalid API key.");
    }

    const project = await ctx.db.get(apiKey.projectId);
    if (!project) {
      throw new ConvexError("Unauthorized: Project not found.");
    }

    if (!project.paymentAccessActive) {
      throw new ConvexError("Unauthorized: Payment access is not activated for this project.");
    }

    const now = Date.now();

    // Resolve payment anchor
    const resolvedAnchor = resolvePaymentAnchor({
      requestedAnchor: args.anchor,
      apiKeyAnchor: apiKey.paymentAnchor,
      projectDefaultAnchor: project.defaultPaymentAnchor,
    });

    // 2. Insert payment intent, using the project ownerAddress as the receiver for security
    const id = await ctx.db.insert("paymentIntents", {
      projectId: project._id,
      amount: args.amount,
      asset: args.asset,
      receiverAddress: project.ownerAddress,
      merchantName: project.name,
      ...(args.description !== undefined ? { description: args.description } : {}),
      status: "created",
      ...(args.successUrl !== undefined ? { successUrl: args.successUrl } : {}),
      ...(args.cancelUrl !== undefined ? { cancelUrl: args.cancelUrl } : {}),
      anchor: resolvedAnchor,
      ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
      expiresAt: now + PAYMENT_INTENT_EXPIRY_MS,
      stageTimestamps: {
        created: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    // 3. Increment request count on the API key
    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: project._id,
      eventType: "payment.created",
      paymentIntentId: id,
      ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
    });

    return { paymentIntentId: id, projectId: project._id };
  },
});

/**
 * Creates a payment intent for SDK-facing REST routes.
 * Auth and project scope are derived from the API key hash.
 */
export const createPublicPaymentIntent = mutation({
  args: {
    apiKeyHash: v.string(),
    correlationId: v.optional(v.string()),
    amount: v.string(),
    asset: v.string(),
    description: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    anchor: v.optional(v.union(v.literal("inhouse"), v.literal("pdax"))),
  },
  handler: async (ctx, args) => {
    const auth = await verifyApiKeyForPayments(ctx, args.apiKeyHash);
    if (!auth.authorized) {
      return { authorized: false as const, reason: auth.reason };
    }

    const now = Date.now();
    const requestFingerprint = createPaymentIntentFingerprint(args);

    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("paymentIntentIdempotencyKeys")
        .withIndex("by_project_and_key", (q) =>
          q.eq("projectId", auth.project._id).eq("key", args.idempotencyKey!),
        )
        .unique();

      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          return {
            authorized: true as const,
            idempotencyConflict: true as const,
            projectId: auth.project._id,
          };
        }

        const intent = await ctx.db.get(existing.paymentIntentId);
        if (intent && intent.projectId === auth.project._id) {
          return {
            authorized: true as const,
            idempotencyReplay: true as const,
            projectId: auth.project._id,
            intent,
          };
        }
      }
    }

    // Resolve payment anchor
    const resolvedAnchor = resolvePaymentAnchor({
      requestedAnchor: args.anchor,
      apiKeyAnchor: auth.apiKey.paymentAnchor,
      projectDefaultAnchor: auth.project.defaultPaymentAnchor,
    });

    const paymentIntentId = await ctx.db.insert("paymentIntents", {
      projectId: auth.project._id,
      amount: args.amount,
      asset: args.asset,
      receiverAddress: auth.project.ownerAddress,
      merchantName: auth.project.name,
      ...(args.description !== undefined ? { description: args.description } : {}),
      status: "created",
      ...(args.successUrl !== undefined ? { successUrl: args.successUrl } : {}),
      ...(args.cancelUrl !== undefined ? { cancelUrl: args.cancelUrl } : {}),
      anchor: resolvedAnchor,
      ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
      expiresAt: now + PAYMENT_INTENT_EXPIRY_MS,
      stageTimestamps: {
        created: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    if (args.idempotencyKey !== undefined) {
      await ctx.db.insert("paymentIntentIdempotencyKeys", {
        projectId: auth.project._id,
        key: args.idempotencyKey,
        requestFingerprint,
        paymentIntentId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: auth.project._id,
      eventType: "payment.created",
      paymentIntentId,
      ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
    });

    const intent = await ctx.db.get(paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found after creation");
    }

    return {
      authorized: true as const,
      idempotencyReplay: false as const,
      projectId: auth.project._id,
      intent,
    };
  },
});

/**
 * Updates a payment intent's status with state machine validation.
 * Used by the checkout page to transition status.
 */
export const updateStatus = mutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    payerAddress: v.optional(v.string()),
    txHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.status === "paid") {
      throw new ConvexError("Public mutation cannot mark payment intent paid");
    }

    const intent = await ctx.db.get(args.paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found");
    }

    const now = Date.now();

    // Check expiry for non-terminal transitions
    if (args.status === "pending" && now > intent.expiresAt) {
      await ctx.db.patch(args.paymentIntentId, {
        status: "expired",
        updatedAt: now,
      });
      throw new ConvexError("Payment intent has expired");
    }

    // Validate state machine transition
    const allowedTransitions = STATUS_TRANSITIONS[intent.status];
    if (!allowedTransitions || !allowedTransitions.has(args.status)) {
      throw new ConvexError(`Invalid status transition: ${intent.status} → ${args.status}`);
    }

    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.payerAddress !== undefined) {
      patch.payerAddress = args.payerAddress;
    }

    if (args.txHash !== undefined) {
      patch.txHash = args.txHash;
    }

    const stageKey = args.status === "pending" ? "submitted" : args.status;
    const updatedStageTimestamps = intent.stageTimestamps
      ? { ...intent.stageTimestamps, [stageKey]: now }
      : { created: intent.createdAt, [stageKey]: now };
    patch.stageTimestamps = updatedStageTimestamps;

    await ctx.db.patch(args.paymentIntentId, patch);

    if (args.status === "pending") {
      const existingJob = await ctx.db
        .query("paymentReconciliationJobs")
        .withIndex("by_payment_intent", (q) => q.eq("paymentIntentId", args.paymentIntentId))
        .unique();
      if (!existingJob) {
        await ctx.db.insert("paymentReconciliationJobs", {
          paymentIntentId: args.paymentIntentId,
          projectId: intent.projectId,
          ...(args.txHash ? { txHash: args.txHash } : {}),
          state: "pending",
          attemptCount: 0,
          nextAttemptAt: now,
          leaseGeneration: 0,
          expiresAt: now + 30 * 60_000,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (args.txHash) {
        await ctx.scheduler.runAfter(0, internal.payment_intents.scanner.watchTransaction, {
          paymentIntentId: args.paymentIntentId,
          txHash: args.txHash,
        });
      }
    }

    if (args.status === "failed") {
      await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
        projectId: intent.projectId,
        eventType: "payment.failed",
        paymentIntentId: args.paymentIntentId,
        ...(intent.correlationId !== undefined ? { correlationId: intent.correlationId } : {}),
      });
    }
  },
});

/**
 * Marks a payment intent paid after backend ledger verification.
 * This is intentionally internal so clients cannot equate Horizon submission with settlement.
 */
export const markVerifiedPaid = internalMutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    txHash: v.string(),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found");
    }

    const now = Date.now();
    if (now > intent.expiresAt) {
      await ctx.db.patch(args.paymentIntentId, {
        status: "expired",
        updatedAt: now,
      });
      throw new ConvexError("Payment intent has expired");
    }

    if (intent.status !== "pending") {
      throw new ConvexError(`Invalid verified paid transition: ${intent.status} -> paid`);
    }

    const updatedStageTimestamps = intent.stageTimestamps
      ? { ...intent.stageTimestamps, confirmed: now }
      : { created: intent.createdAt, confirmed: now };

    await ctx.db.patch(args.paymentIntentId, {
      status: "paid",
      txHash: args.txHash,
      updatedAt: now,
      stageTimestamps: updatedStageTimestamps,
    });

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: intent.projectId,
      eventType: "payment.succeeded",
      paymentIntentId: args.paymentIntentId,
      ...(intent.correlationId !== undefined ? { correlationId: intent.correlationId } : {}),
    });
  },
});

export const prepareOrInsertPaymentIntentV2 = internalMutation({
  args: {
    apiKeyHash: v.string(),
    correlationId: v.optional(v.string()),
    amount: v.string(),
    asset: v.string(),
    description: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    anchor: v.optional(v.union(v.literal("inhouse"), v.literal("pdax"))),
  },
  handler: async (ctx, args) => {
    const auth = await verifyApiKeyForPayments(ctx, args.apiKeyHash);
    if (!auth.authorized) {
      return { status: "unauthorized" as const, reason: auth.reason };
    }

    const resolvedAnchor = resolvePaymentAnchor({
      requestedAnchor: args.anchor,
      apiKeyAnchor: auth.apiKey.paymentAnchor,
      projectDefaultAnchor: auth.project.defaultPaymentAnchor,
    });

    const now = Date.now();

    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("paymentIntentIdempotencyKeys")
        .withIndex("by_project_and_key", (q) =>
          q.eq("projectId", auth.project._id).eq("key", args.idempotencyKey!),
        )
        .unique();

      if (existing) {
        const requestFingerprint = createPaymentIntentFingerprint({
          amount: args.amount,
          asset: args.asset,
          description: args.description,
          successUrl: args.successUrl,
          cancelUrl: args.cancelUrl,
          anchor: resolvedAnchor,
        });

        if (existing.requestFingerprint !== requestFingerprint) {
          return {
            status: "idempotency_conflict" as const,
            projectId: auth.project._id,
          };
        }

        const intent = await ctx.db.get(existing.paymentIntentId);
        if (intent && intent.projectId === auth.project._id) {
          return {
            status: "idempotency_replay" as const,
            projectId: auth.project._id,
            intent,
          };
        }
      }
    }

    if (resolvedAnchor === "pdax") {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_project_provider", (q) =>
          q.eq("projectId", auth.project._id).eq("provider", "pdax"),
        )
        .unique();

      const hasPdaxConnection = connection ? connection.status === "connected" : false;
      if (!hasPdaxConnection) {
        return {
          status: "pdax_not_connected" as const,
          reason: "PDAX provider not connected for this project.",
        };
      }

      return {
        status: "pdax_required" as const,
        projectId: auth.project._id,
      };
    }

    const paymentIntentId = await ctx.db.insert("paymentIntents", {
      projectId: auth.project._id,
      amount: args.amount,
      asset: args.asset,
      receiverAddress: auth.project.ownerAddress,
      merchantName: auth.project.name,
      ...(args.description !== undefined ? { description: args.description } : {}),
      status: "created",
      ...(args.successUrl !== undefined ? { successUrl: args.successUrl } : {}),
      ...(args.cancelUrl !== undefined ? { cancelUrl: args.cancelUrl } : {}),
      anchor: "inhouse",
      ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
      expiresAt: now + PAYMENT_INTENT_EXPIRY_MS,
      stageTimestamps: {
        created: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    if (args.idempotencyKey !== undefined) {
      const requestFingerprint = createPaymentIntentFingerprint({
        amount: args.amount,
        asset: args.asset,
        description: args.description,
        successUrl: args.successUrl,
        cancelUrl: args.cancelUrl,
        anchor: "inhouse",
      });

      await ctx.db.insert("paymentIntentIdempotencyKeys", {
        projectId: auth.project._id,
        key: args.idempotencyKey,
        requestFingerprint,
        paymentIntentId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: auth.project._id,
      eventType: "payment.created",
      paymentIntentId,
      ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
    });

    const intent = await ctx.db.get(paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found after creation");
    }

    return {
      status: "inhouse_success" as const,
      projectId: auth.project._id,
      intent,
    };
  },
});

export const insertPublicPaymentIntentV2 = internalMutation({
  args: {
    apiKeyHash: v.string(),
    correlationId: v.optional(v.string()),
    amount: v.string(),
    asset: v.string(),
    description: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    anchor: v.union(v.literal("inhouse"), v.literal("pdax")),
    receiverAddress: v.string(),
    receiverMemo: v.optional(v.string()),
    anchorDepositCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await verifyApiKeyForPayments(ctx, args.apiKeyHash);
    if (!auth.authorized) {
      return { status: "unauthorized" as const, reason: auth.reason || "Unauthorized" };
    }

    const now = Date.now();

    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("paymentIntentIdempotencyKeys")
        .withIndex("by_project_and_key", (q) =>
          q.eq("projectId", auth.project._id).eq("key", args.idempotencyKey!),
        )
        .unique();

      if (existing) {
        const requestFingerprint = createPaymentIntentFingerprint({
          amount: args.amount,
          asset: args.asset,
          description: args.description,
          successUrl: args.successUrl,
          cancelUrl: args.cancelUrl,
          anchor: args.anchor,
        });

        if (existing.requestFingerprint !== requestFingerprint) {
          return { status: "idempotency_conflict" as const };
        }

        const intent = await ctx.db.get(existing.paymentIntentId);
        if (intent && intent.projectId === auth.project._id) {
          return { status: "idempotency_replay" as const, intent };
        }
      }
    }

    const paymentIntentId = await ctx.db.insert("paymentIntents", {
      projectId: auth.project._id,
      amount: args.amount,
      asset: args.asset,
      receiverAddress: args.receiverAddress,
      merchantName: auth.project.name,
      ...(args.description !== undefined ? { description: args.description } : {}),
      status: "created",
      ...(args.successUrl !== undefined ? { successUrl: args.successUrl } : {}),
      ...(args.cancelUrl !== undefined ? { cancelUrl: args.cancelUrl } : {}),
      anchor: args.anchor,
      ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
      receiverMemo: args.receiverMemo,
      anchorDepositCurrency: args.anchorDepositCurrency,
      expiresAt: now + PAYMENT_INTENT_EXPIRY_MS,
      stageTimestamps: {
        created: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    if (args.idempotencyKey !== undefined) {
      const requestFingerprint = createPaymentIntentFingerprint({
        amount: args.amount,
        asset: args.asset,
        description: args.description,
        successUrl: args.successUrl,
        cancelUrl: args.cancelUrl,
        anchor: args.anchor,
      });

      await ctx.db.insert("paymentIntentIdempotencyKeys", {
        projectId: auth.project._id,
        key: args.idempotencyKey,
        requestFingerprint,
        paymentIntentId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: auth.project._id,
      eventType: "payment.created",
      paymentIntentId,
      ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
    });

    const intent = await ctx.db.get(paymentIntentId);
    if (!intent) {
      throw new ConvexError("Payment intent not found after creation");
    }

    return { status: "success" as const, intent };
  },
});

const ROUTE_JOB_LEASE_MS = 8_500;
const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;
const CIRCUIT_OPEN_MS = 30_000;
const MAX_ROUTE_ATTEMPTS = 5;
const ROUTE_RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 60_000] as const;

export const createPublicPaymentIntentV2 = mutation({
  args: {
    apiKeyHash: v.string(),
    correlationId: v.optional(v.string()),
    amount: v.string(),
    asset: v.string(),
    description: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    anchor: v.optional(v.union(v.literal("inhouse"), v.literal("pdax"))),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const auth = await verifyApiKeyForPayments(ctx, args.apiKeyHash);
    const authCompletedAt = Date.now();
    if (!auth.authorized) return { status: "unauthorized" as const, reason: auth.reason };

    const resolvedAnchor = resolvePaymentAnchor({
      requestedAnchor: args.anchor,
      apiKeyAnchor: auth.apiKey.paymentAnchor,
      projectDefaultAnchor: auth.project.defaultPaymentAnchor,
    });
    const fingerprint = createPaymentIntentFingerprint({ ...args, anchor: resolvedAnchor });
    const now = Date.now();
    const mappedAsset = resolvedAnchor === "pdax" ? mapAssetToPdax(args.asset) : undefined;
    let cachedPdaxRoute: { address: string; memo?: string; mappedAsset: string } | undefined;

    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("paymentIntentIdempotencyKeys")
        .withIndex("by_project_and_key", (q) =>
          q.eq("projectId", auth.project._id).eq("key", args.idempotencyKey!),
        )
        .unique();
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          return { status: "idempotency_conflict" as const, projectId: auth.project._id };
        }
        const intent = await ctx.db.get(existing.paymentIntentId);
        if (intent?.projectId === auth.project._id) {
          return {
            status: "idempotency_replay" as const,
            projectId: auth.project._id,
            intent,
            timings: { authMs: authCompletedAt - startedAt, totalMs: Date.now() - startedAt },
          };
        }
      }
    }

    if (resolvedAnchor === "pdax") {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_project_provider", (q) =>
          q.eq("projectId", auth.project._id).eq("provider", "pdax"),
        )
        .unique();
      if (connection?.status !== "connected") {
        return { status: "anchor_not_connected" as const, projectId: auth.project._id };
      }

      const cached = await ctx.db
        .query("pdaxRouteCache")
        .withIndex("by_project_and_mapped_asset", (q) =>
          q.eq("projectId", auth.project._id).eq("mappedAsset", mappedAsset!),
        )
        .unique();
      if (cached && cached.expiresAt > now) {
        cachedPdaxRoute = {
          address: cached.address,
          ...(cached.memo !== undefined ? { memo: cached.memo } : {}),
          mappedAsset: cached.mappedAsset,
        };
      }
    }

    const paymentIntentId = await ctx.db.insert("paymentIntents", {
      projectId: auth.project._id,
      amount: args.amount,
      asset: args.asset,
      ...(resolvedAnchor === "inhouse"
        ? { receiverAddress: auth.project.ownerAddress }
        : cachedPdaxRoute
          ? {
              receiverAddress: cachedPdaxRoute.address,
              ...(cachedPdaxRoute.memo !== undefined ? { receiverMemo: cachedPdaxRoute.memo } : {}),
              anchorDepositCurrency: cachedPdaxRoute.mappedAsset,
            }
          : {}),
      merchantName: auth.project.name,
      ...(args.description !== undefined ? { description: args.description } : {}),
      status: resolvedAnchor === "pdax" && !cachedPdaxRoute ? "awaiting_route" : "created",
      ...(args.successUrl !== undefined ? { successUrl: args.successUrl } : {}),
      ...(args.cancelUrl !== undefined ? { cancelUrl: args.cancelUrl } : {}),
      anchor: resolvedAnchor,
      ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
      expiresAt: now + PAYMENT_INTENT_EXPIRY_MS,
      stageTimestamps: {
        created: now,
        ...(cachedPdaxRoute ? { routeReady: now } : {}),
      },
      createdAt: now,
      updatedAt: now,
    });

    if (args.idempotencyKey !== undefined) {
      await ctx.db.insert("paymentIntentIdempotencyKeys", {
        projectId: auth.project._id,
        key: args.idempotencyKey,
        requestFingerprint: fingerprint,
        paymentIntentId,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (resolvedAnchor === "pdax" && !cachedPdaxRoute) {
      await ctx.db.insert("paymentIntentRouteJobs", {
        paymentIntentId,
        projectId: auth.project._id,
        mappedAsset: mappedAsset!,
        state: "scheduled",
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.payment_intents.actions.enrichPdaxRoute, {
        paymentIntentId,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
        projectId: auth.project._id,
        eventType: "payment.created",
        paymentIntentId,
        ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
      });
    }

    const intent = await ctx.db.get(paymentIntentId);
    if (!intent) throw new ConvexError("Payment intent not found after creation");
    return {
      status: "success" as const,
      projectId: auth.project._id,
      intent,
      timings: { authMs: authCompletedAt - startedAt, totalMs: Date.now() - startedAt },
    };
  },
});

export const claimRouteJob = internalMutation({
  args: { paymentIntentId: v.id("paymentIntents"), leaseToken: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db
      .query("paymentIntentRouteJobs")
      .withIndex("by_payment_intent", (q) => q.eq("paymentIntentId", args.paymentIntentId))
      .unique();
    const intent = await ctx.db.get(args.paymentIntentId);
    if (!job || !intent) return { status: "done" as const };
    if (intent.status !== "awaiting_route") {
      if (job.state !== "succeeded" && job.state !== "failed") {
        await ctx.db.patch(job._id, {
          state: "failed",
          lastErrorCode: `intent_${intent.status}`,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          updatedAt: now,
        });
      }
      return { status: "done" as const };
    }
    if (job.state === "succeeded" || job.state === "failed") return { status: "done" as const };
    if (job.nextAttemptAt > now) return { status: "wait" as const, retryAt: job.nextAttemptAt };
    if (job.leaseExpiresAt && job.leaseExpiresAt > now) {
      return { status: "wait" as const, retryAt: job.leaseExpiresAt };
    }
    await ctx.db.patch(job._id, {
      state: "leased",
      leaseToken: args.leaseToken,
      leaseExpiresAt: now + ROUTE_JOB_LEASE_MS,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      ROUTE_JOB_LEASE_MS,
      internal.payment_intents.actions.enrichPdaxRoute,
      { paymentIntentId: args.paymentIntentId },
    );
    return {
      status: "claimed" as const,
      jobId: job._id,
      projectId: job.projectId,
      mappedAsset: job.mappedAsset,
      correlationId: intent.correlationId,
    };
  },
});

export const claimProviderRoute = internalMutation({
  args: {
    projectId: v.id("projects"),
    mappedAsset: v.string(),
    leaseToken: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cached = await ctx.db
      .query("pdaxRouteCache")
      .withIndex("by_project_and_mapped_asset", (q) =>
        q.eq("projectId", args.projectId).eq("mappedAsset", args.mappedAsset),
      )
      .unique();
    if (cached && cached.expiresAt > now) {
      return { status: "cache_hit" as const, address: cached.address, memo: cached.memo };
    }
    let resilience = await ctx.db
      .query("providerResilience")
      .withIndex("by_project_and_provider", (q) =>
        q.eq("projectId", args.projectId).eq("provider", "pdax"),
      )
      .unique();
    if (resilience?.circuitOpenUntil && resilience.circuitOpenUntil > now) {
      return { status: "circuit_open" as const, retryAt: resilience.circuitOpenUntil };
    }
    if (resilience?.leaseExpiresAt && resilience.leaseExpiresAt > now) {
      return { status: "coalesced" as const, retryAt: resilience.leaseExpiresAt };
    }
    if (resilience) {
      await ctx.db.patch(resilience._id, {
        leaseToken: args.leaseToken,
        leaseExpiresAt: now + ROUTE_JOB_LEASE_MS,
        updatedAt: now,
      });
    } else {
      const id = await ctx.db.insert("providerResilience", {
        projectId: args.projectId,
        provider: "pdax",
        consecutiveFailures: 0,
        leaseToken: args.leaseToken,
        leaseExpiresAt: now + ROUTE_JOB_LEASE_MS,
        updatedAt: now,
      });
      resilience = await ctx.db.get(id);
    }
    return { status: "claimed" as const };
  },
});

export const completePdaxRoute = internalMutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    leaseToken: v.string(),
    mappedAsset: v.string(),
    address: v.string(),
    memo: v.optional(v.string()),
    fromCache: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db
      .query("paymentIntentRouteJobs")
      .withIndex("by_payment_intent", (q) => q.eq("paymentIntentId", args.paymentIntentId))
      .unique();
    const intent = await ctx.db.get(args.paymentIntentId);
    if (
      !job ||
      job.leaseToken !== args.leaseToken ||
      !job.leaseExpiresAt ||
      job.leaseExpiresAt <= now ||
      intent?.status !== "awaiting_route"
    ) {
      return { applied: false };
    }
    if (intent.expiresAt <= now) {
      await ctx.db.patch(intent._id, {
        status: "expired",
        updatedAt: now,
      });
      await ctx.db.patch(job._id, {
        state: "failed",
        lastErrorCode: "intent_expired",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      return { applied: false };
    }
    if (!args.fromCache) {
      const resilience = await ctx.db
        .query("providerResilience")
        .withIndex("by_project_and_provider", (q) =>
          q.eq("projectId", job.projectId).eq("provider", "pdax"),
        )
        .unique();
      if (
        resilience?.leaseToken !== args.leaseToken ||
        !resilience.leaseExpiresAt ||
        resilience.leaseExpiresAt <= now
      ) {
        return { applied: false };
      }
      const cached = await ctx.db
        .query("pdaxRouteCache")
        .withIndex("by_project_and_mapped_asset", (q) =>
          q.eq("projectId", job.projectId).eq("mappedAsset", args.mappedAsset),
        )
        .unique();
      const cacheValue = {
        projectId: job.projectId,
        mappedAsset: args.mappedAsset,
        address: args.address,
        ...(args.memo !== undefined ? { memo: args.memo } : {}),
        expiresAt: now + ROUTE_CACHE_TTL_MS,
        updatedAt: now,
      };
      if (cached) await ctx.db.replace(cached._id, cacheValue);
      else await ctx.db.insert("pdaxRouteCache", cacheValue);
      await ctx.db.patch(resilience._id, {
        consecutiveFailures: 0,
        circuitOpenUntil: undefined,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
    }
    await ctx.db.patch(intent._id, {
      receiverAddress: args.address,
      ...(args.memo !== undefined ? { receiverMemo: args.memo } : {}),
      anchorDepositCurrency: args.mappedAsset,
      status: "created",
      stageTimestamps: {
        created: intent.stageTimestamps?.created ?? intent.createdAt,
        ...intent.stageTimestamps,
        routeReady: now,
      },
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      state: "succeeded",
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: intent.projectId,
      eventType: "payment.created",
      paymentIntentId: intent._id,
      ...(intent.correlationId !== undefined ? { correlationId: intent.correlationId } : {}),
    });
    return { applied: true };
  },
});

export const deferPdaxRoute = internalMutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    leaseToken: v.string(),
    retryAt: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("paymentIntentRouteJobs")
      .withIndex("by_payment_intent", (q) => q.eq("paymentIntentId", args.paymentIntentId))
      .unique();
    if (!job || job.leaseToken !== args.leaseToken) return false;
    const delay = Math.max(0, args.retryAt - Date.now());
    await ctx.db.patch(job._id, {
      state: "retry_wait",
      nextAttemptAt: args.retryAt,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(delay, internal.payment_intents.actions.enrichPdaxRoute, {
      paymentIntentId: args.paymentIntentId,
    });
    return true;
  },
});

export const failPdaxRoute = internalMutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    leaseToken: v.string(),
    errorCode: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db
      .query("paymentIntentRouteJobs")
      .withIndex("by_payment_intent", (q) => q.eq("paymentIntentId", args.paymentIntentId))
      .unique();
    const intent = await ctx.db.get(args.paymentIntentId);
    if (!job || job.leaseToken !== args.leaseToken || intent?.status !== "awaiting_route")
      return false;
    const attempts = job.attempts + 1;
    const resilience = await ctx.db
      .query("providerResilience")
      .withIndex("by_project_and_provider", (q) =>
        q.eq("projectId", job.projectId).eq("provider", "pdax"),
      )
      .unique();
    const failures = (resilience?.consecutiveFailures ?? 0) + 1;
    if (resilience?.leaseToken === args.leaseToken) {
      await ctx.db.patch(resilience._id, {
        consecutiveFailures: failures,
        ...(failures >= 3 ? { circuitOpenUntil: now + CIRCUIT_OPEN_MS } : {}),
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
    }
    if (attempts >= MAX_ROUTE_ATTEMPTS) {
      await ctx.db.patch(job._id, {
        state: "failed",
        attempts,
        lastErrorCode: args.errorCode,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      await ctx.db.patch(intent._id, {
        status: "failed",
        stageTimestamps: {
          created: intent.stageTimestamps?.created ?? intent.createdAt,
          ...intent.stageTimestamps,
          routeFailed: now,
        },
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
        projectId: intent.projectId,
        eventType: "payment.failed",
        paymentIntentId: intent._id,
        ...(intent.correlationId !== undefined ? { correlationId: intent.correlationId } : {}),
      });
      return true;
    }
    const retryDelay =
      ROUTE_RETRY_DELAYS_MS[Math.min(attempts - 1, ROUTE_RETRY_DELAYS_MS.length - 1)] ?? 60_000;
    await ctx.db.patch(job._id, {
      state: "retry_wait",
      attempts,
      nextAttemptAt: now + retryDelay,
      lastErrorCode: args.errorCode,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(retryDelay, internal.payment_intents.actions.enrichPdaxRoute, {
      paymentIntentId: args.paymentIntentId,
    });
    return true;
  },
});

/**
 * Recovers PDAX route work whose scheduled action was lost or whose worker lease expired.
 * The cron calling this mutation is a safety net; claimRouteJob still provides fencing.
 */
export const recoverPdaxRouteJobs = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = Math.max(1, Math.min(Math.floor(args.limit), 100));
    const dueJobs = [];

    for (const state of ["scheduled", "retry_wait", "leased"] as const) {
      const remaining = limit - dueJobs.length;
      if (remaining <= 0) break;
      const jobs = await ctx.db
        .query("paymentIntentRouteJobs")
        .withIndex("by_state_and_next_attempt_at", (q) =>
          q.eq("state", state).lte("nextAttemptAt", now),
        )
        .take(remaining);
      dueJobs.push(...jobs);
    }

    let recovered = 0;
    let expired = 0;
    for (const job of dueJobs) {
      if (job.state === "leased" && job.leaseExpiresAt && job.leaseExpiresAt > now) continue;

      const intent = await ctx.db.get(job.paymentIntentId);
      if (!intent || intent.status !== "awaiting_route") {
        await ctx.db.patch(job._id, {
          state: "failed",
          lastErrorCode: intent ? `intent_${intent.status}` : "intent_not_found",
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          updatedAt: now,
        });
        continue;
      }

      if (intent.expiresAt <= now) {
        await ctx.db.patch(intent._id, {
          status: "expired",
          stageTimestamps: {
            created: intent.stageTimestamps?.created ?? intent.createdAt,
            ...intent.stageTimestamps,
            expired: now,
          },
          updatedAt: now,
        });
        await ctx.db.patch(job._id, {
          state: "failed",
          lastErrorCode: "intent_expired",
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          updatedAt: now,
        });
        expired += 1;
        continue;
      }

      await ctx.db.patch(job._id, {
        state: "scheduled",
        nextAttemptAt: now,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.payment_intents.actions.enrichPdaxRoute, {
        paymentIntentId: job.paymentIntentId,
      });
      recovered += 1;
    }

    return { recovered, expired };
  },
});
