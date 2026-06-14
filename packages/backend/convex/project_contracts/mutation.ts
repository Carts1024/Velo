import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { normalizeTransactionHash } from "../projects/helpers";
import {
  normalizeContractId,
  requireOwnerContract,
  requireRegisteredOwnerProject,
} from "./helpers";

export const markAddPending = mutation({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
    contractId: v.string(),
    transactionHash: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await requireRegisteredOwnerProject(ctx, args.projectId, args.ownerAddress);
    const registryProjectId = project.registryProjectId;

    if (registryProjectId === undefined) {
      throw new Error("Registered project is missing registry project ID");
    }

    const contractId = normalizeContractId(args.contractId);
    const existing = await ctx.db
      .query("projectContracts")
      .withIndex("by_project_contract", (q) =>
        q.eq("projectId", args.projectId).eq("contractId", contractId),
      )
      .unique();
    const now = Date.now();
    const patch = {
      ownerAddress: project.ownerAddress,
      registryProjectId,
      status: "pending_add" as const,
      addTxHash: normalizeTransactionHash(args.transactionHash),
      removeTxHash: undefined,
      error: undefined,
      lastSyncAt: now,
      updatedAt: now,
    };

    if (existing) {
      if (
        existing.status === "active" ||
        existing.status === "pending_add" ||
        existing.status === "pending_remove"
      ) {
        throw new Error("Contract is already linked to this project");
      }

      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("projectContracts", {
      projectId: args.projectId,
      contractId,
      ...patch,
      createdAt: now,
    });
  },
});

export const markAddConfirmed = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
    confirmedLedger: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const contract = await requireOwnerContract(ctx, args.id, args.ownerAddress);

    if (contract.status !== "pending_add") {
      throw new Error("Only pending additions can be confirmed");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      error: undefined,
      confirmedLedger: args.confirmedLedger,
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const markRemovePending = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
    transactionHash: v.string(),
  },
  handler: async (ctx, args) => {
    const contract = await requireOwnerContract(ctx, args.id, args.ownerAddress);

    if (
      contract.status !== "active" &&
      !(contract.status === "contract_error" && contract.confirmedLedger !== undefined)
    ) {
      throw new Error("Only active or failed contract links can be removed");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "pending_remove",
      removeTxHash: normalizeTransactionHash(args.transactionHash),
      error: undefined,
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const markRemoved = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const contract = await requireOwnerContract(ctx, args.id, args.ownerAddress);

    if (contract.status !== "pending_remove") {
      throw new Error("Only pending removals can be confirmed");
    }

    await ctx.db.delete(args.id);
  },
});

export const markStale = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const contract = await requireOwnerContract(ctx, args.id, args.ownerAddress);

    if (contract.status !== "pending_add" && contract.status !== "pending_remove") {
      throw new Error("Only pending contract updates can become stale");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "stale",
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});

export const markError = mutation({
  args: {
    id: v.id("projectContracts"),
    ownerAddress: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const contract = await requireOwnerContract(ctx, args.id, args.ownerAddress);

    if (
      contract.status !== "pending_add" &&
      contract.status !== "pending_remove" &&
      contract.status !== "stale"
    ) {
      throw new Error("Only pending or stale contract updates can fail");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "contract_error",
      error: args.error.slice(0, 500),
      lastSyncAt: now,
      updatedAt: now,
    });
  },
});
