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

test("Velo checkout.sessions.create and paymentIntents.create construct correct requests", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  let calledOptions: RequestInit | undefined;

  globalThis.fetch = async (url, options) => {
    calledUrl = url.toString();
    calledOptions = options;
    return new Response(JSON.stringify({ id: "pi_123", object: "payment_intent" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const velo = new Velo({ apiKey: "test-key", baseUrl: "https://api.example.com" });
    const res1 = await velo.checkout.sessions.create({ amount: "10.00", asset: "USDC" });
    assert.deepEqual(res1, { id: "pi_123", object: "payment_intent" });
    assert.equal(calledUrl, "https://api.example.com/api/v2/payment-intents");
    assert.equal(calledOptions?.method, "POST");
    assert.equal(calledOptions?.body, JSON.stringify({ amount: "10.00", asset: "USDC" }));

    const res2 = await velo.paymentIntents.create({ amount: "20.00", asset: "USDC" });
    assert.deepEqual(res2, { id: "pi_123", object: "payment_intent" });
    assert.equal(calledUrl, "https://api.example.com/api/v2/payment-intents");
    assert.equal(calledOptions?.method, "POST");
    assert.equal(calledOptions?.body, JSON.stringify({ amount: "20.00", asset: "USDC" }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Velo paymentIntents.retrieve retrieves payment intent by id with encoding", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";

  globalThis.fetch = async (url) => {
    calledUrl = url.toString();
    return new Response(JSON.stringify({ id: "pi_123", object: "payment_intent" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const velo = new Velo({ apiKey: "test-key", baseUrl: "https://api.example.com" });
    const res = await velo.paymentIntents.retrieve("pi/123");
    assert.deepEqual(res, { id: "pi_123", object: "payment_intent" });
    assert.equal(calledUrl, "https://api.example.com/api/v2/payment-intents/pi%2F123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Velo paymentIntents.retrieve validates that ID is present", async () => {
  const velo = new Velo({ apiKey: "test-key" });
  await assert.rejects(() => velo.paymentIntents.retrieve(""), /Payment intent ID is required/);
  await assert.rejects(() => velo.paymentIntents.retrieve("   "), /Payment intent ID is required/);
});

test("Velo paymentIntents.list parses query parameters correctly", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";

  globalThis.fetch = async (url) => {
    calledUrl = url.toString();
    return new Response(
      JSON.stringify({ object: "list", data: [], hasMore: false, nextCursor: null }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const velo = new Velo({ apiKey: "test-key", baseUrl: "https://api.example.com" });
    const res = await velo.paymentIntents.list({ status: "paid", limit: 50, cursor: "abc" });
    assert.deepEqual(res, { object: "list", data: [], hasMore: false, nextCursor: null });
    assert.equal(
      calledUrl,
      "https://api.example.com/api/v2/payment-intents?status=paid&limit=50&cursor=abc",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET request retries on 500 then succeeds", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (_url, _options) => {
    calls++;
    if (calls === 1) {
      return new Response(
        JSON.stringify({ error: { type: "api_error", message: "Server error", code: "internal" } }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ id: "pi_123", object: "payment_intent" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const velo = new Velo({ apiKey: "test-key", baseUrl: "https://api.example.com" });
    const res = await velo.paymentIntents.retrieve("pi_123");
    assert.deepEqual(res, { id: "pi_123", object: "payment_intent" });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST without idempotency key does not retry on 500", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (_url, _options) => {
    calls++;
    return new Response(
      JSON.stringify({ error: { type: "api_error", message: "Server error", code: "internal" } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const velo = new Velo({ apiKey: "test-key", baseUrl: "https://api.example.com" });
    await assert.rejects(
      () => velo.checkout.sessions.create({ amount: "10.00" }),
      (err: unknown) => {
        assert.equal(err instanceof VeloAPIError, true);
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST with idempotency key retries on 500", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (_url, _options) => {
    calls++;
    if (calls === 1) {
      return new Response(
        JSON.stringify({ error: { type: "api_error", message: "Server error", code: "internal" } }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ id: "pi_123", object: "payment_intent" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const velo = new Velo({ apiKey: "test-key", baseUrl: "https://api.example.com" });
    const res = await velo.checkout.sessions.create(
      { amount: "10.00" },
      { idempotencyKey: "idem-1" },
    );
    assert.deepEqual(res, { id: "pi_123", object: "payment_intent" });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Velo checkout.sessions.create serializes anchor parameter", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  let calledOptions: RequestInit | undefined;

  globalThis.fetch = async (url, options) => {
    calledUrl = url.toString();
    calledOptions = options;
    return new Response(JSON.stringify({ id: "pi_123", object: "payment_intent" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const velo = new Velo({ apiKey: "test-key", baseUrl: "https://api.example.com" });
    await velo.checkout.sessions.create({ amount: "10.00", asset: "USDC", anchor: "pdax" });
    assert.equal(calledUrl, "https://api.example.com/api/v2/payment-intents");
    const body = JSON.parse(calledOptions?.body as string);
    assert.equal(body.anchor, "pdax");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Velo paymentIntents.retrieve returns V2 fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        id: "pi_123",
        object: "payment_intent",
        paymentIntentId: "pi_123",
        status: "created",
        amount: "10.00",
        asset: "native",
        description: null,
        checkoutUrl: "http://localhost:3000/pay/pi_123",
        successUrl: null,
        cancelUrl: null,
        anchor: "pdax",
        receiverAddress: "G-DEPOSIT",
        receiverMemo: "12345",
        anchorDepositCurrency: "XLM",
        payerAddress: "G-PAYER",
        expiresAt: "2026-07-01T00:30:00.000Z",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const velo = new Velo({ apiKey: "test-key", baseUrl: "https://api.example.com" });
    const res = await velo.paymentIntents.retrieve("pi_123");
    assert.equal(res.anchor, "pdax");
    assert.equal(res.receiverAddress, "G-DEPOSIT");
    assert.equal(res.receiverMemo, "12345");
    assert.equal(res.anchorDepositCurrency, "XLM");
    assert.equal(res.payerAddress, "G-PAYER");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
