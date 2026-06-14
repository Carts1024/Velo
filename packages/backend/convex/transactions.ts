import { lookupTestnetTransaction } from "@repo/stellar";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";

import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";

const CACHE_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";
const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{64}$/i;

type TransactionLookupResult = {
  hash: string;
  network: "testnet";
  status: "success" | "failed" | "not_found" | "pending" | "unavailable" | "unsupported";
  ledger?: number;
  createdAt?: number;
  feeCharged?: string;
  resultCode?: string;
  operations: unknown[];
  contractCalls: unknown[];
  events: unknown[];
  failureReason?: string;
  hint?: string;
  rawResponse: string;
  fetchedAt: number;
  source: "cache" | "rpc";
};

function normalizeHash(hash: string) {
  const normalized = hash.trim().toLowerCase();

  if (!TRANSACTION_HASH_PATTERN.test(normalized)) {
    throw new Error("Transaction hash must be a 64-character hexadecimal value");
  }

  return normalized;
}

function normalizeCreatedAt(value: unknown) {
  if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) {
    return undefined;
  }

  const createdAt = typeof value === "number" ? value : Number(value);
  return Number.isFinite(createdAt) ? createdAt : undefined;
}

export const getByHash = query({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const hash = normalizeHash(args.hash);
    return await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
  },
});

export const getCached = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
  },
});

export const store = internalMutation({
  args: {
    hash: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("not_found"),
      v.literal("pending"),
      v.literal("unavailable"),
      v.literal("unsupported"),
    ),
    ledger: v.optional(v.number()),
    createdAt: v.optional(v.union(v.number(), v.string())),
    feeCharged: v.optional(v.string()),
    resultCode: v.optional(v.string()),
    operations: v.array(v.any()),
    contractCalls: v.array(v.any()),
    events: v.array(v.any()),
    failureReason: v.optional(v.string()),
    hint: v.optional(v.string()),
    rawResponse: v.string(),
  },
  handler: async (ctx, args) => {
    const createdAt = normalizeCreatedAt(args.createdAt);
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    const value = {
      ...args,
      createdAt,
      network: "testnet" as const,
      fetchedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }

    return await ctx.db.insert("transactions", value);
  },
});

export const lookup = action({
  args: {
    hash: v.string(),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<TransactionLookupResult> => {
    const hash = normalizeHash(args.hash);
    const cached: Doc<"transactions"> | null = await ctx.runQuery(internal.transactions.getCached, {
      hash,
    });

    if (!args.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
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
      const result = await lookupTestnetTransaction(
        process.env.STELLAR_RPC_URL ??
          process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
          DEFAULT_TESTNET_RPC_URL,
        hash,
      );
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

      await ctx.runMutation(internal.transactions.store, storeResult);
      return { ...normalizedResult, fetchedAt: Date.now(), source: "rpc" };
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

      await ctx.runMutation(internal.transactions.store, failure);
      return {
        ...failure,
        network: "testnet" as const,
        fetchedAt: Date.now(),
        source: "rpc",
      };
    }
  },
});
