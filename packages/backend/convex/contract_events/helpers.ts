import type { QueryCtx } from "../_generated/server";
import type { ProjectId } from "../projects/types";
import type { PollerState, PollStatus } from "./types";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_SCHEDULED_CONTRACTS = 100;
export const MAX_SCHEDULED_PROJECTS = 20;

const STALE_AFTER_MS = 2 * 60 * 1_000;
export const METADATA_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export function projectScope(projectId: ProjectId) {
  return `project:${projectId}`;
}

export function normalizeOwnerAddress(address: string) {
  return address.trim().toUpperCase();
}

export function normalizePageSize(limit?: number) {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, limit ?? DEFAULT_PAGE_SIZE));
}

export async function pollerForProject(ctx: QueryCtx, projectId: ProjectId) {
  return await ctx.db
    .query("pollerState")
    .withIndex("by_scope", (q) => q.eq("scope", projectScope(projectId)))
    .unique();
}

export function publicPollStatus(poller: PollerState | null, eventCount: number): PollStatus {
  if (!poller) {
    return eventCount > 0 ? "stale" : "empty";
  }

  if (poller.status === "polling" || poller.status === "error") {
    return poller.status;
  }

  if (!poller.lastRunAt || Date.now() - poller.lastRunAt > STALE_AFTER_MS) {
    return "stale";
  }

  return eventCount > 0 ? "live" : "empty";
}
