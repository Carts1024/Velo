import { api } from "@repo/backend/convex/_generated/api.js";
import { ConvexHttpClient } from "convex/browser";

export type DistributedRateLimit = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

export function distributedRateLimitHeaders(result: DistributedRateLimit) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    ...(result.retryAfterMs > 0
      ? { "Retry-After": String(Math.max(1, Math.ceil(result.retryAfterMs / 1_000))) }
      : {}),
  };
}

export async function consumeDistributedRateLimit(
  convex: ConvexHttpClient,
  apiKeyHash: string,
): Promise<{ authorized: false } | ({ authorized: true } & DistributedRateLimit)> {
  return await convex.mutation(
    api.rate_limits.mutations.consume,
    { apiKeyHash },
    { skipQueue: true },
  );
}
