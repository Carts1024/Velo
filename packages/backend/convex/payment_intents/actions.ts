import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getOrRefreshPdaxConnection } from "../settlement/helpers";

const ROUTE_WORKER_BUDGET_MS = 8_000;

function emitRouteMetric(name: string, fields: Record<string, unknown> = {}) {
  console.info("velo.payment_route", { name, provider: "pdax", ...fields });
}

function routeErrorCode(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("timeout") || message.includes("abort")) return "provider_timeout";
    if (message.includes("429")) return "provider_rate_limited";
    if (message.includes("invalid deposit")) return "provider_invalid_response";
    if (message.includes("network") || message.includes("fetch")) return "provider_network_error";
  }
  return "provider_unavailable";
}

export const enrichPdaxRoute = internalAction({
  args: { paymentIntentId: v.id("paymentIntents") },
  handler: async (ctx, args): Promise<null> => {
    const leaseToken = globalThis.crypto.randomUUID();
    const claim = await ctx.runMutation(internal.payment_intents.mutations.claimRouteJob, {
      paymentIntentId: args.paymentIntentId,
      leaseToken,
    });
    if (claim.status === "done") return null;
    if (claim.status === "wait") {
      await ctx.scheduler.runAt(claim.retryAt, internal.payment_intents.actions.enrichPdaxRoute, {
        paymentIntentId: args.paymentIntentId,
      });
      return null;
    }

    const provider = await ctx.runMutation(internal.payment_intents.mutations.claimProviderRoute, {
      projectId: claim.projectId,
      mappedAsset: claim.mappedAsset,
      leaseToken,
    });
    if (provider.status === "cache_hit") {
      emitRouteMetric("cache_hit");
      await ctx.runMutation(internal.payment_intents.mutations.completePdaxRoute, {
        paymentIntentId: args.paymentIntentId,
        leaseToken,
        mappedAsset: claim.mappedAsset,
        address: provider.address,
        fromCache: true,
        ...(provider.memo !== undefined ? { memo: provider.memo } : {}),
      });
      return null;
    }
    if (provider.status === "circuit_open" || provider.status === "coalesced") {
      emitRouteMetric(provider.status);
      await ctx.runMutation(internal.payment_intents.mutations.deferPdaxRoute, {
        paymentIntentId: args.paymentIntentId,
        leaseToken,
        retryAt: provider.retryAt,
      });
      return null;
    }

    emitRouteMetric("cache_miss");
    const signal = AbortSignal.timeout(ROUTE_WORKER_BUDGET_MS);
    const startedAt = Date.now();
    try {
      const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(
        ctx,
        claim.projectId,
        {
          signal,
          telemetryContext: {
            requestCorrelationId: leaseToken,
            ...(claim.correlationId ? { journeyCorrelationId: claim.correlationId } : {}),
            ...(claim.traceparent ? { traceparent: claim.traceparent } : {}),
          },
        },
      );
      const response = await client.cryptoDepositAddress(
        accessToken,
        idToken,
        claim.mappedAsset,
        signal,
      );
      if (response.status !== "success" || !response.data?.address) {
        throw new Error("Invalid deposit lookup response from PDAX");
      }
      const applied = await ctx.runMutation(internal.payment_intents.mutations.completePdaxRoute, {
        paymentIntentId: args.paymentIntentId,
        leaseToken,
        mappedAsset: claim.mappedAsset,
        address: response.data.address,
        fromCache: false,
        ...(response.data.tag !== undefined ? { memo: response.data.tag } : {}),
      });
      emitRouteMetric("provider_success", {
        applied: applied.applied,
        durationMs: Date.now() - startedAt,
        correlationId: claim.correlationId,
      });
    } catch (error) {
      const errorCode = routeErrorCode(error);
      emitRouteMetric("provider_failure", {
        errorCode,
        durationMs: Date.now() - startedAt,
        correlationId: claim.correlationId,
      });
      await ctx.runMutation(internal.payment_intents.mutations.failPdaxRoute, {
        paymentIntentId: args.paymentIntentId,
        leaseToken,
        errorCode,
      });
    }
    return null;
  },
});
