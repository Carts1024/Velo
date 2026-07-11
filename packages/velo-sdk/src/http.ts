import type { VeloConfig, RequestOptions } from "./types.ts";
import {
  mapErrorResponse,
  VeloError,
  VeloRateLimitError,
  VeloSubmissionUnknownError,
  VeloTimeoutError,
} from "./errors.ts";

export function resolveBaseUrl(config: VeloConfig): string {
  if (config.baseUrl) return config.baseUrl;
  if (config.environment === "production") return "https://api.velo.pay";
  if (config.environment === "testnet") return "https://api.testnet.velo.pay";
  return "http://localhost:3000";
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_RETRY_MAX_MS = 2_000;

function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

function isNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error && /fetch failed|ECONNREFUSED|ENOTFOUND|network error/i.test(error.message))
  );
}

function isRetryable(error: unknown) {
  return (
    error instanceof VeloRateLimitError ||
    (error instanceof VeloError &&
      (error.status === 408 ||
        error.status === 425 ||
        error.status === 500 ||
        error.status === 502 ||
        error.status === 503 ||
        error.status === 504)) ||
    isNetworkError(error)
  );
}

function canRetry(method: string, options?: RequestOptions) {
  return (
    method === "GET" ||
    method === "HEAD" ||
    method === "DELETE" ||
    (method === "PUT" && !!options?.idempotencyKey) ||
    (method === "POST" && !!options?.idempotencyKey && !options.submission)
  );
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortReason(signal));
      },
      { once: true },
    );
  });
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;

  constructor(config: VeloConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = resolveBaseUrl(config);
    this.timeoutMs = Math.max(1, config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.maxRetries = Math.max(0, Math.floor(config.maxRetries ?? DEFAULT_MAX_RETRIES));
    this.retryBaseDelayMs = Math.max(0, config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_MS);
    this.retryMaxDelayMs = Math.max(
      this.retryBaseDelayMs,
      config.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_MS,
    );
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const timeoutMs = Math.max(1, options?.timeoutMs ?? this.timeoutMs);
    const maxRetries = Math.max(0, Math.floor(options?.maxRetries ?? this.maxRetries));
    const deadline = Date.now() + timeoutMs;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (options?.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    if (options?.correlationId) headers["X-Correlation-Id"] = options.correlationId;

    for (let attempt = 0; ; attempt++) {
      if (options?.signal?.aborted) throw abortReason(options.signal);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new VeloTimeoutError(`Request timed out after ${timeoutMs}ms`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), remaining);
      const abortExternal = () => controller.abort();
      options?.signal?.addEventListener("abort", abortExternal, { once: true });
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        const requestId = response.headers.get("x-request-id") ?? undefined;
        const contentType = response.headers.get("content-type") ?? "";
        const text = await response.text();
        let payload: unknown = text;
        if (contentType.includes("application/json") && text) {
          try {
            payload = JSON.parse(text);
          } catch {
            // Preserve the text body so callers still get useful context.
          }
        }
        if (!response.ok) {
          const error = mapErrorResponse(response.status, payload, requestId);
          const retry = retryAfterMs(response.headers.get("retry-after"));
          if (retry !== undefined) (error as VeloError).retryAfterMs = retry;
          throw error;
        }
        return payload as T;
      } catch (error) {
        if (options?.signal?.aborted) throw abortReason(options.signal);
        if (error instanceof VeloTimeoutError || (error instanceof Error && error.name === "AbortError")) {
          if (options?.submission) throw new VeloSubmissionUnknownError();
          throw new VeloTimeoutError(`Request timed out after ${timeoutMs}ms`);
        }
        if (options?.submission && isNetworkError(error)) throw new VeloSubmissionUnknownError();
        if (!canRetry(method, options) || !isRetryable(error) || attempt >= maxRetries) throw error;
        const retryDelay =
          error instanceof VeloError && error.retryAfterMs !== undefined
            ? error.retryAfterMs
            : Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * 2 ** attempt) *
              (0.5 + Math.random());
        const delay = Math.min(retryDelay, Math.max(0, deadline - Date.now()));
        if (delay <= 0) throw new VeloTimeoutError(`Request timed out after ${timeoutMs}ms`);
        await wait(delay, options?.signal);
      } finally {
        clearTimeout(timeout);
        options?.signal?.removeEventListener("abort", abortExternal);
      }
    }
  }
}
