import { fetchRecentContractEvents } from "@repo/stellar";
import { v } from "convex/values";

import type { ActionCtx } from "./_generated/server";
import type { PollTarget } from "./contract_events/types";

import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { requireIdentity } from "./projects/helpers";

const DEFAULT_TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";

type OwnerPollTarget = Omit<PollTarget, "projectId">;

type PollResult = {
  eventCount: number;
  contractCount: number;
};

function rpcUrl() {
  return (
    process.env.STELLAR_RPC_URL ??
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
    DEFAULT_TESTNET_RPC_URL
  );
}

async function pollTarget(ctx: ActionCtx, target: PollTarget): Promise<PollResult> {
  if (target.contractIds.length === 0) {
    await ctx.runMutation(internal.contract_events.mutation.storePollResult, {
      projectId: target.projectId,
      latestLedger: target.lastLedger,
      events: [],
    });
    return { eventCount: 0, contractCount: 0 };
  }

  await ctx.runMutation(internal.poller_state.mutation.markPolling, {
    projectId: target.projectId,
  });

  try {
    const result = await fetchRecentContractEvents({
      rpcUrl: rpcUrl(),
      contractIds: target.contractIds,
      afterLedger: target.lastLedger,
    });

    await ctx.runMutation(internal.contract_events.mutation.storePollResult, {
      projectId: target.projectId,
      latestLedger: result.latestLedger,
      events: result.events,
    });

    return { eventCount: result.events.length, contractCount: target.contractIds.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stellar event polling failed";
    await ctx.runMutation(internal.poller_state.mutation.markError, {
      projectId: target.projectId,
      message,
    });
    throw new Error(message);
  }
}

export const pollProject = action({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args): Promise<PollResult> => {
    const identity = await requireIdentity(ctx);
    const target: OwnerPollTarget = await ctx.runQuery(
      internal.contract_events.query.getPollTarget,
      {
        projectId: args.projectId,
        ownerTokenIdentifier: identity.tokenIdentifier,
        ownerSubject: identity.subject,
      },
    );
    return await pollTarget(ctx, { ...target, projectId: args.projectId });
  },
});

export const pollScheduled = internalAction({
  args: {},
  handler: async (ctx): Promise<{ projectCount: number; eventCount: number }> => {
    const targets: PollTarget[] = await ctx.runQuery(
      internal.contract_events.query.listScheduledTargets,
      {},
    );
    let eventCount = 0;

    for (const target of targets) {
      try {
        const result = await pollTarget(ctx, target);
        eventCount += result.eventCount;
      } catch {
        // Persist the per-project error and continue polling the remaining bounded targets.
      }
    }

    return { projectCount: targets.length, eventCount };
  },
});
