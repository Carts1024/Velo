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

export const createPublicPaymentIntentV2 = action({
  args: {
    apiKeyHash: v.string(),
    amount: v.string(),
    asset: v.string(),
    description: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    anchor: v.optional(v.union(v.literal("inhouse"), v.literal("pdax"))),
  },
  handler: async (ctx, args): Promise<unknown> => {
    // 1. Resolve and authenticate intent request details via Query
    const res = await ctx.runQuery(internal.payment_intents.queries.resolveIntentRequest, {
      apiKeyHash: args.apiKeyHash,
      amount: args.amount,
      asset: args.asset,
      description: args.description,
      successUrl: args.successUrl,
      cancelUrl: args.cancelUrl,
      idempotencyKey: args.idempotencyKey,
      anchor: args.anchor,
    });

    if (!res.authorized) {
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

    // If we proceed, check resolved anchor
    const resolvedAnchor = res.resolvedAnchor!;
    const projectId = res.projectId!;

    if (resolvedAnchor === "pdax") {
      // Verify PDAX connection exists and is connected
      if (!res.hasPdaxConnection) {
        return {
          authorized: false as const,
          reason: "PDAX provider not connected for this project.",
        };
      }

      // Map the asset for PDAX deposit lookup
      const mappedAsset = mapAssetToPdax(args.asset);

      // Fetch deposit address and memo from PDAX
      try {
        const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(ctx, projectId);
        const depositInfo = await client.cryptoDepositAddress(accessToken, idToken, mappedAsset);

        if (depositInfo.status !== "success" || !depositInfo.data || !depositInfo.data.address) {
          throw new Error("Invalid deposit lookup response from PDAX");
        }

        const { address, tag } = depositInfo.data;

        // Call mutation to insert PDAX payment intent
        const intent = await ctx.runMutation(
          internal.payment_intents.mutations.insertPublicPaymentIntentV2,
          {
            apiKeyHash: args.apiKeyHash,
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

        return {
          authorized: true as const,
          idempotencyReplay: false as const,
          projectId,
          intent,
        };
      } catch (error) {
        console.error("PDAX deposit lookup failed:", error);
        throw new ConvexError({
          code: "anchor_unavailable",
          message: "The PDAX payment anchor is currently unavailable.",
        });
      }
    } else {
      // Resolved anchor is "inhouse"
      const intent = await ctx.runMutation(
        internal.payment_intents.mutations.insertPublicPaymentIntentV2,
        {
          apiKeyHash: args.apiKeyHash,
          amount: args.amount,
          asset: args.asset,
          description: args.description,
          successUrl: args.successUrl,
          cancelUrl: args.cancelUrl,
          idempotencyKey: args.idempotencyKey,
          anchor: "inhouse",
          receiverAddress: res.ownerAddress!,
        },
      );

      return {
        authorized: true as const,
        idempotencyReplay: false as const,
        projectId,
        intent,
      };
    }
  },
});
