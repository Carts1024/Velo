export type BucketSpec = { capacity: number; refillPerSecond: number };
export type BucketState = { tokens: number; updatedAt: number };

export function refillBucket(state: BucketState | undefined, spec: BucketSpec, now: number) {
  if (!state) return { tokens: spec.capacity, updatedAt: now };
  return {
    tokens: Math.min(
      spec.capacity,
      state.tokens + ((now - state.updatedAt) / 1_000) * spec.refillPerSecond,
    ),
    updatedAt: now,
  };
}

export function consumeAtomicPair(args: {
  api: BucketState | undefined;
  project: BucketState | undefined;
  apiSpec: BucketSpec;
  projectSpec: BucketSpec;
  now: number;
}) {
  const api = refillBucket(args.api, args.apiSpec, args.now);
  const project = refillBucket(args.project, args.projectSpec, args.now);
  const allowed = api.tokens >= 1 && project.tokens >= 1;
  if (allowed) {
    api.tokens -= 1;
    project.tokens -= 1;
  }
  const retryAfterMs = allowed
    ? 0
    : Math.max(
        api.tokens < 1 ? Math.ceil(((1 - api.tokens) / args.apiSpec.refillPerSecond) * 1_000) : 0,
        project.tokens < 1
          ? Math.ceil(((1 - project.tokens) / args.projectSpec.refillPerSecond) * 1_000)
          : 0,
      );
  return {
    api,
    project,
    allowed,
    limit: Math.min(args.apiSpec.capacity, args.projectSpec.capacity),
    remaining: Math.max(0, Math.floor(Math.min(api.tokens, project.tokens))),
    retryAfterMs,
  };
}
