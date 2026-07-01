import assert from "node:assert/strict";
import test from "node:test";

import { Velo } from "./client.ts";
import { VeloAPIError, VeloAuthError, VeloRateLimitError, VeloValidationError } from "./errors.ts";
import { HttpClient, resolveBaseUrl } from "./http.ts";

test("Velo constructor validates apiKey", () => {
  assert.throws(() => new Velo({ apiKey: "" }), /API key is required/);
  assert.throws(() => new Velo({ apiKey: "   " }), /API key is required/);
  assert.throws(() => new Velo({ apiKey: null as unknown as string }), /API key is required/);
});

test("resolveBaseUrl works as expected", () => {
  assert.equal(
    resolveBaseUrl({ apiKey: "key", baseUrl: "https://custom.velo.pay" }),
    "https://custom.velo.pay",
  );
  assert.equal(
    resolveBaseUrl({ apiKey: "key", environment: "production" }),
    "https://api.velo.pay",
  );
  assert.equal(
    resolveBaseUrl({ apiKey: "key", environment: "testnet" }),
    "https://api.testnet.velo.pay",
  );
  assert.equal(
    resolveBaseUrl({ apiKey: "key", environment: "development" }),
    "http://localhost:3000",
  );
  assert.equal(resolveBaseUrl({ apiKey: "key" }), "http://localhost:3000");
});

test("HttpClient sets correct authorization and custom headers", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  let calledOptions: RequestInit | undefined;

  globalThis.fetch = async (url, options) => {
    calledUrl = url.toString();
    calledOptions = options;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const client = new HttpClient({ apiKey: "test-key", baseUrl: "https://api.example.com" });
    const res = await client.request(
      "POST",
      "/test",
      { foo: "bar" },
      { idempotencyKey: "idem-123" },
    );

    assert.deepEqual(res, { success: true });
    assert.equal(calledUrl, "https://api.example.com/test");
    assert.equal(calledOptions?.method, "POST");

    const headers = calledOptions?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer test-key");
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["Idempotency-Key"], "idem-123");
    assert.equal(calledOptions?.body, JSON.stringify({ foo: "bar" }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HttpClient timeout behavior throws error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const signal = options?.signal;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve(new Response(JSON.stringify({}), { status: 200 }));
      }, 100);

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }
    });
  };

  try {
    const client = new HttpClient({ apiKey: "test-key", timeoutMs: 10 });
    await assert.rejects(
      () => client.request("GET", "/test"),
      (err: unknown) => {
        assert.equal(err instanceof VeloAPIError, true);
        const error = err as VeloAPIError;
        assert.equal(error.status, 408);
        assert.match(error.message, /timed out/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HttpClient maps REST error responses correctly", async () => {
  const originalFetch = globalThis.fetch;

  const mockErrorResponse = (
    status: number,
    type: string,
    message: string,
    code: string,
    param?: string,
  ) => {
    return async () => {
      const responseBody = JSON.stringify({
        error: { type, message, code, param },
      });
      return new Response(responseBody, {
        status,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req-id-123",
        },
      });
    };
  };

  try {
    const client = new HttpClient({ apiKey: "test-key" });

    // 401 Unauthorized -> VeloAuthError
    globalThis.fetch = mockErrorResponse(401, "auth_error", "Invalid API key", "invalid_api_key");
    await assert.rejects(
      () => client.request("GET", "/test"),
      (err: unknown) => {
        assert.equal(err instanceof VeloAuthError, true);
        const error = err as VeloAuthError;
        assert.equal(error.status, 401);
        assert.equal(error.code, "invalid_api_key");
        assert.equal(error.requestId, "req-id-123");
        return true;
      },
    );

    // 400 Bad Request -> VeloValidationError
    globalThis.fetch = mockErrorResponse(
      400,
      "validation_error",
      "Invalid amount",
      "invalid_request",
      "amount",
    );
    await assert.rejects(
      () => client.request("GET", "/test"),
      (err: unknown) => {
        assert.equal(err instanceof VeloValidationError, true);
        const error = err as VeloValidationError;
        assert.equal(error.status, 400);
        assert.equal(error.code, "invalid_request");
        assert.equal(error.param, "amount");
        assert.equal(error.requestId, "req-id-123");
        return true;
      },
    );

    // 429 Too Many Requests -> VeloRateLimitError
    globalThis.fetch = mockErrorResponse(
      429,
      "rate_limit_error",
      "Rate limit exceeded",
      "rate_limit_exceeded",
    );
    await assert.rejects(
      () => client.request("GET", "/test"),
      (err: unknown) => {
        assert.equal(err instanceof VeloRateLimitError, true);
        const error = err as VeloRateLimitError;
        assert.equal(error.status, 429);
        assert.equal(error.code, "rate_limit_exceeded");
        assert.equal(error.requestId, "req-id-123");
        return true;
      },
    );

    // 500 Internal Error -> VeloAPIError
    globalThis.fetch = mockErrorResponse(500, "api_error", "Internal error", "internal_error");
    await assert.rejects(
      () => client.request("GET", "/test"),
      (err: unknown) => {
        assert.equal(err instanceof VeloAPIError, true);
        const error = err as VeloAPIError;
        assert.equal(error.status, 500);
        assert.equal(error.code, "internal_error");
        assert.equal(error.requestId, "req-id-123");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
