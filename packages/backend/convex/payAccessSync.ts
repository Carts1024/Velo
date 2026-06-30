import { fetchRecentContractEvents } from "@repo/stellar";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

const DEFAULT_TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";

const PAY_ACCESS_CONTRACT_ID =
  process.env.VELO_PAY_ACCESS_CONTRACT_ID ??
  process.env.NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID ??
  "CBHDLZYSYWETHPC6KDGH35S4SNBU5P7QWLNNDWYXJRHZMZDTQSKYVOXJ";

function rpcUrl() {
  return (
    process.env.STELLAR_RPC_URL ??
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
    DEFAULT_TESTNET_RPC_URL
  );
}

export const syncPayAccessEvents = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. Get the current poller state for 'global:pay_access'
    const pollerState = await ctx.runQuery(internal.payAccessSync.getPollerState);
    const lastLedger = pollerState?.lastLedger;

    // 2. Fetch events from the VeloPayAccess contract
    const result = await fetchRecentContractEvents({
      rpcUrl: rpcUrl(),
      contractIds: [PAY_ACCESS_CONTRACT_ID],
      afterLedger: lastLedger,
    });

    if (result.events.length === 0) {
      if (result.latestLedger !== undefined) {
        await ctx.runMutation(internal.payAccessSync.updatePollerState, {
          latestLedger: result.latestLedger,
        });
      }
      return { eventCount: 0, processedCount: 0 };
    }

    // 3. Process each event and trigger mutations
    let processedCount = 0;
    for (const event of result.events) {
      // The topics are ["pay", "activate" | "deactivate" | "consume"]
      if (event.topics && event.topics.length >= 2 && event.topics[0] === "pay") {
        const actionType = event.topics[1]; // "activate", "deactivate", "consume"
        const decoded = event.decoded as {
          project_id?: string;
          credits?: string;
          remaining?: string;
        } | null;

        if (decoded && decoded.project_id) {
          const registryProjectId = Number(decoded.project_id);

          if (actionType === "activate") {
            const credits = decoded.credits ? Number(decoded.credits) : 100;
            await ctx.runMutation(internal.payAccessSync.updateProjectAccess, {
              registryProjectId,
              paymentAccessActive: true,
              checkoutCredits: credits,
            });
            processedCount++;
          } else if (actionType === "deactivate") {
            await ctx.runMutation(internal.payAccessSync.updateProjectAccess, {
              registryProjectId,
              paymentAccessActive: false,
            });
            processedCount++;
          } else if (actionType === "consume") {
            const remaining = decoded.remaining ? Number(decoded.remaining) : 0;
            await ctx.runMutation(internal.payAccessSync.updateProjectAccess, {
              registryProjectId,
              checkoutCredits: remaining,
            });
            processedCount++;
          }
        }
      }
    }

    // 4. Update the poller state with the new latestLedger
    if (result.latestLedger !== undefined) {
      await ctx.runMutation(internal.payAccessSync.updatePollerState, {
        latestLedger: result.latestLedger,
      });
    }

    return { eventCount: result.events.length, processedCount };
  },
});

export const getPollerState = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("pollerState")
      .withIndex("by_scope", (q) => q.eq("scope", "global:pay_access"))
      .unique();
  },
});

export const updatePollerState = internalMutation({
  args: {
    latestLedger: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pollerState")
      .withIndex("by_scope", (q) => q.eq("scope", "global:pay_access"))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastLedger: args.latestLedger,
        lastRunAt: now,
        status: "idle",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("pollerState", {
        scope: "global:pay_access",
        lastLedger: args.latestLedger,
        lastRunAt: now,
        status: "idle",
        updatedAt: now,
      });
    }
  },
});

export const updateProjectAccess = internalMutation({
  args: {
    registryProjectId: v.number(),
    paymentAccessActive: v.optional(v.boolean()),
    checkoutCredits: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_registry_project_id", (q) => q.eq("registryProjectId", args.registryProjectId))
      .unique();

    if (!project) {
      return;
    }

    const updates: {
      paymentAccessLastSyncAt: number;
      updatedAt: number;
      paymentAccessActive?: boolean;
      checkoutCredits?: number;
    } = {
      paymentAccessLastSyncAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (args.paymentAccessActive !== undefined) {
      updates.paymentAccessActive = args.paymentAccessActive;
    }
    if (args.checkoutCredits !== undefined) {
      updates.checkoutCredits = args.checkoutCredits;
    }

    const wasActive = project.paymentAccessActive;
    await ctx.db.patch(project._id, updates);

    if (args.paymentAccessActive === true && !wasActive) {
      await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
        projectId: project._id,
        eventType: "payment_access.activated",
      });
    }
  },
});
