"use node";

import { lookupTestnetTransaction } from "@repo/stellar";
import { v } from "convex/values";

import type { Transaction } from "./types";
import type { TransactionLookupResult } from "./types";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { CACHE_TTL_MS, normalizeCreatedAt, normalizeHash, testnetRpcUrl } from "./helpers";

export const lookup = action({
  args: {
    hash: v.string(),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<TransactionLookupResult> => {
    const hash = normalizeHash(args.hash);
    const cached: Transaction | null = await ctx.runQuery(internal.transactions.query.getCached, {
      hash,
    });

    const isTerminal = cached && (cached.status === "success" || cached.status === "failed");
    const ttl = isTerminal ? CACHE_TTL_MS : 0;

    if (!args.forceRefresh && cached && Date.now() - cached.fetchedAt < ttl) {
      return {
        hash: cached.hash,
        network: cached.network,
        status: cached.status,
        ledger: cached.ledger,
        createdAt: cached.createdAt,
        feeCharged: cached.feeCharged,
        resultCode: cached.resultCode,
        operations: cached.operations,
        contractCalls: cached.contractCalls,
        events: cached.events,
        failureReason: cached.failureReason,
        hint: cached.hint,
        rawResponse: cached.rawResponse,
        fetchedAt: cached.fetchedAt,
        source: "cache",
      };
    }

    try {
      const result = await lookupTestnetTransaction(testnetRpcUrl(), hash);
      const normalizedResult = {
        ...result,
        createdAt: normalizeCreatedAt(result.createdAt),
      };
      const storeResult = {
        hash: normalizedResult.hash,
        status: normalizedResult.status,
        ledger: normalizedResult.ledger,
        createdAt: normalizedResult.createdAt,
        feeCharged: normalizedResult.feeCharged,
        resultCode: normalizedResult.resultCode,
        operations: normalizedResult.operations,
        contractCalls: normalizedResult.contractCalls,
        events: normalizedResult.events,
        failureReason: normalizedResult.failureReason,
        hint: normalizedResult.hint,
        rawResponse: normalizedResult.rawResponse,
      };

      await ctx.runMutation(internal.transactions.mutation.store, storeResult);
      return { ...normalizedResult, network: "testnet", fetchedAt: Date.now(), source: "rpc" };
    } catch (error) {
      const failure = {
        hash,
        status: "unavailable" as const,
        operations: [],
        contractCalls: [],
        events: [],
        failureReason: error instanceof Error ? error.message : "Stellar RPC lookup failed",
        hint: "Retry the lookup. If it persists, confirm the Testnet RPC endpoint is available.",
        rawResponse: JSON.stringify(
          { error: error instanceof Error ? error.message : "Stellar RPC lookup failed" },
          null,
          2,
        ),
      };

      await ctx.runMutation(internal.transactions.mutation.store, failure);
      return {
        ...failure,
        network: "testnet",
        fetchedAt: Date.now(),
        source: "rpc",
      };
    }
  },
});
