import { v, ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { getOrRefreshPdaxConnection } from "../settlement/helpers";

function mapAssetToPdax(asset: string): string {
  if (asset === "native" || asset === "XLM") {
    return "XLM";
  }
  if (asset === "USDC" || asset.startsWith("USDC:")) {
    return "USDCXLM";
  }
  return asset;
}

// Simple in-memory cache for PDAX deposit info to prevent redundant network calls
const pdaxCache = new Map<
  string, // projectId + ":" + mappedAsset
  { address: string; tag?: string; expiresAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

export const createPublicPaymentIntentV2 = action({
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
  handler: async (ctx, args): Promise<unknown> => {
    // 1. Resolve auth, project, idempotency, and anchor in a single atomic transaction
    const res = await ctx.runMutation(
      internal.payment_intents.mutations.prepareOrInsertPaymentIntentV2,
      {
        apiKeyHash: args.apiKeyHash,
        correlationId: args.correlationId,
        amount: args.amount,
        asset: args.asset,
        description: args.description,
        successUrl: args.successUrl,
        cancelUrl: args.cancelUrl,
        idempotencyKey: args.idempotencyKey,
        anchor: args.anchor,
      },
    );

    if (res.status === "unauthorized") {
      return { authorized: false as const, reason: res.reason };
    }

    if (res.status === "pdax_not_connected") {
      return { authorized: false as const, reason: res.reason };
    }

    if (res.status === "idempotency_conflict") {
      return {
        authorized: true as const,
        idempotencyConflict: true as const,
        projectId: res.projectId,
      };
    }

    if (res.status === "idempotency_replay") {
      return {
        authorized: true as const,
        idempotencyReplay: true as const,
        projectId: res.projectId,
        intent: res.intent,
      };
    }

    if (res.status === "inhouse_success") {
      return {
        authorized: true as const,
        idempotencyReplay: false as const,
        projectId: res.projectId,
        intent: res.intent,
      };
    }

    // Otherwise status is "pdax_required"
    const projectId = res.projectId!;
    const mappedAsset = mapAssetToPdax(args.asset);
    const cacheKey = `${projectId}:${mappedAsset}`;
    const isTest = process.env.VITEST !== undefined;
    const cached = isTest ? undefined : pdaxCache.get(cacheKey);

    let address: string;
    let tag: string | undefined;

    if (cached && cached.expiresAt > Date.now()) {
      address = cached.address;
      tag = cached.tag;
    } else {
      try {
        const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(ctx, projectId);

        // Strict 5-second timeout for PDAX lookup
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("PDAX API lookup timeout")), 5000),
        );

        const depositInfo = (await Promise.race([
          client.cryptoDepositAddress(accessToken, idToken, mappedAsset),
          timeoutPromise,
        ])) as unknown as {
          status: string;
          data?: { address: string; tag?: string };
        };

        if (depositInfo.status !== "success" || !depositInfo.data || !depositInfo.data.address) {
          throw new Error("Invalid deposit lookup response from PDAX");
        }

        address = depositInfo.data.address;
        tag = depositInfo.data.tag;

        // Cache the resolved static address info
        pdaxCache.set(cacheKey, {
          address,
          tag,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      } catch (error) {
        console.error("PDAX deposit lookup failed:", error);
        throw new ConvexError({
          code: "anchor_unavailable",
          message: "The PDAX payment anchor is currently unavailable.",
        });
      }
    }

    // Call mutation to insert PDAX payment intent atomically
    const insertRes = await ctx.runMutation(
      internal.payment_intents.mutations.insertPublicPaymentIntentV2,
      {
        apiKeyHash: args.apiKeyHash,
        correlationId: args.correlationId,
        amount: args.amount,
        asset: args.asset,
        description: args.description,
        successUrl: args.successUrl,
        cancelUrl: args.cancelUrl,
        idempotencyKey: args.idempotencyKey,
        anchor: "pdax",
        receiverAddress: address,
        ...(tag !== undefined ? { receiverMemo: tag } : {}),
        anchorDepositCurrency: mappedAsset,
      },
    );

    if (insertRes.status === "unauthorized") {
      return { authorized: false as const, reason: insertRes.reason };
    }

    if (insertRes.status === "idempotency_conflict") {
      return {
        authorized: true as const,
        idempotencyConflict: true as const,
        projectId,
      };
    }

    if (insertRes.status === "idempotency_replay") {
      return {
        authorized: true as const,
        idempotencyReplay: true as const,
        projectId,
        intent: insertRes.intent,
      };
    }

    return {
      authorized: true as const,
      idempotencyReplay: false as const,
      projectId,
      intent: insertRes.intent,
    };
  },
});
