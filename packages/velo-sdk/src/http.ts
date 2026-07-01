import type { VeloConfig, RequestOptions } from "./types.ts";

import { mapErrorResponse, VeloAPIError, VeloRateLimitError } from "./errors.ts";

export function resolveBaseUrl(config: VeloConfig): string {
  if (config.baseUrl) {
    return config.baseUrl;
  }
  const env = config.environment;
  if (env === "production") {
    return "https://api.velo.pay";
  }
  if (env === "testnet") {
    return "https://api.testnet.velo.pay";
  }
  return "http://localhost:3000";
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: VeloConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = resolveBaseUrl(config);
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    if (options?.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const maxRetries = 2;
    let attempt = 0;

    while (true) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        const requestId = response.headers.get("x-request-id") || undefined;

        let payload: unknown;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const text = await response.text();
          try {
            payload = JSON.parse(text);
          } catch {
            payload = text;
          }
        } else {
          payload = await response.text();
        }

        if (!response.ok) {
          throw mapErrorResponse(response.status, payload, requestId);
        }

        return payload as T;
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === "AbortError" || (err instanceof DOMException && err.name === "AbortError"))
        ) {
          throw new VeloAPIError(`Request timed out after ${this.timeoutMs}ms`, {
            status: 408,
            code: "timeout",
          });
        }

        // Network failures in fetch throw TypeError
        const isNetworkError =
          err instanceof TypeError ||
          (err instanceof Error &&
            (err.message.includes("fetch failed") ||
              err.message.includes("ECONNREFUSED") ||
              err.message.includes("ENOTFOUND") ||
              err.message.includes("network error")));

        const isRetryableError =
          err instanceof VeloRateLimitError ||
          (err instanceof VeloAPIError && err.status !== undefined && err.status >= 500) ||
          isNetworkError;

        const canRetryMethod = method === "GET" || (method === "POST" && !!options?.idempotencyKey);

        if (isRetryableError && canRetryMethod && attempt <= maxRetries) {
          const delay = 500 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }
}
