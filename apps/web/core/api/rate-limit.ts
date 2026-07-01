interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

class InMemoryRateLimiter {
  private keyBuckets = new Map<string, TokenBucket>();
  private projectBuckets = new Map<string, TokenBucket>();
  private keyToProjectCache = new Map<string, string>();

  // Configuration (overrideable via env variables)
  private readonly KEY_LIMIT = Number(process.env.RATE_LIMIT_KEY_MAX || "60");
  private readonly KEY_REFILL_RATE = Number(process.env.RATE_LIMIT_KEY_REFILL_RATE || "1"); // tokens/sec (60/min)
  private readonly PROJECT_LIMIT = Number(process.env.RATE_LIMIT_PROJECT_MAX || "100");
  private readonly PROJECT_REFILL_RATE = Number(
    process.env.RATE_LIMIT_PROJECT_REFILL_RATE || "1.67",
  ); // tokens/sec (100/min)

  private getBucket(
    buckets: Map<string, TokenBucket>,
    key: string,
    maxTokens: number,
  ): TokenBucket {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: maxTokens, lastRefill: now };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  private refill(bucket: TokenBucket, maxTokens: number, refillRatePerSec: number) {
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefill;
    if (elapsedMs > 0) {
      const refillAmount = (elapsedMs / 1000) * refillRatePerSec;
      bucket.tokens = Math.min(maxTokens, bucket.tokens + refillAmount);
      bucket.lastRefill = now;
    }
  }

  /**
   * Helper method to reset all internal maps.
   * Primarily used for testing purposes.
   */
  public reset() {
    this.keyBuckets.clear();
    this.projectBuckets.clear();
    this.keyToProjectCache.clear();
  }

  /**
   * Checks rate limits for a given API key hash.
   * If the key's project mapping is cached, also checks the project-level limit.
   */
  public checkLimit(apiKeyHash: string): {
    allowed: boolean;
    retryAfterSec?: number;
    headers: Record<string, string>;
  } {
    const keyBucket = this.getBucket(this.keyBuckets, apiKeyHash, this.KEY_LIMIT);
    this.refill(keyBucket, this.KEY_LIMIT, this.KEY_REFILL_RATE);

    const projectId = this.keyToProjectCache.get(apiKeyHash);
    let projectBucket: TokenBucket | null = null;

    if (projectId) {
      projectBucket = this.getBucket(this.projectBuckets, projectId, this.PROJECT_LIMIT);
      this.refill(projectBucket, this.PROJECT_LIMIT, this.PROJECT_REFILL_RATE);
    }

    const keyRemaining = Math.floor(keyBucket.tokens);
    const projectRemaining = projectBucket ? Math.floor(projectBucket.tokens) : this.PROJECT_LIMIT;

    const remaining = Math.min(keyRemaining, projectRemaining);
    const limit = projectId ? Math.min(this.KEY_LIMIT, this.PROJECT_LIMIT) : this.KEY_LIMIT;

    const headers: Record<string, string> = {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": Math.max(0, remaining).toString(),
    };

    // Check key limit first
    if (keyBucket.tokens < 1) {
      const waitMs = ((1 - keyBucket.tokens) / this.KEY_REFILL_RATE) * 1000;
      const retryAfterSec = Math.ceil(waitMs / 1000);
      headers["Retry-After"] = retryAfterSec.toString();
      return { allowed: false, retryAfterSec, headers };
    }

    // Check project limit if mapping is cached
    if (projectBucket && projectBucket.tokens < 1) {
      const waitMs = ((1 - projectBucket.tokens) / this.PROJECT_REFILL_RATE) * 1000;
      const retryAfterSec = Math.ceil(waitMs / 1000);
      headers["Retry-After"] = retryAfterSec.toString();
      return { allowed: false, retryAfterSec, headers };
    }

    // Consume 1 token from both
    keyBucket.tokens -= 1;
    if (projectBucket) {
      projectBucket.tokens -= 1;
    }

    // Update remaining tokens count in headers
    const newRemaining = Math.min(
      Math.floor(keyBucket.tokens),
      projectBucket ? Math.floor(projectBucket.tokens) : this.PROJECT_LIMIT,
    );
    headers["X-RateLimit-Remaining"] = Math.max(0, newRemaining).toString();

    return { allowed: true, headers };
  }

  /**
   * Caches the association between an API key hash and its project ID.
   */
  public cacheKeyProjectMapping(apiKeyHash: string, projectId: string) {
    this.keyToProjectCache.set(apiKeyHash, projectId);
  }
}

export const rateLimiter = new InMemoryRateLimiter();
