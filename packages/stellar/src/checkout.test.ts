import assert from "node:assert/strict";
import test from "node:test";

import { createCheckoutSession } from "./checkout.ts";

test("createCheckoutSession calls fetch with correct headers and payload", async () => {
  const mockResponse = {
    paymentIntentId: "test-intent-id",
    checkoutUrl: "http://localhost:3000/pay/test-intent-id",
    expiresIn: 1800,
  };

  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  let calledUrl = "";
  let calledOptions: RequestInit | undefined;

  globalThis.fetch = async (url, options) => {
    fetchCalled = true;
    calledUrl = url.toString();
    calledOptions = options;
    return {
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response;
  };

  try {
    const result = await createCheckoutSession({
      apiKey: "tk_live_abcdef1234567890abcdef1234567890",
      amount: "5.50",
      asset: "native",
      description: "Test checkout",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      baseUrl: "http://localhost:3000",
    });

    assert.equal(fetchCalled, true);
    assert.equal(calledUrl, "http://localhost:3000/api/v1/payment-intents");
    assert.equal(calledOptions?.method, "POST");

    const headers = calledOptions?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer tk_live_abcdef1234567890abcdef1234567890");
    assert.equal(headers["Content-Type"], "application/json");

    const body = JSON.parse(calledOptions?.body as string);
    assert.equal(body.amount, "5.50");
    assert.equal(body.asset, "native");
    assert.equal(body.description, "Test checkout");
    assert.equal(body.successUrl, "https://example.com/success");
    assert.equal(body.cancelUrl, "https://example.com/cancel");

    assert.deepEqual(result, mockResponse);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createCheckoutSession rejects missing api key", async () => {
  await assert.rejects(
    () => createCheckoutSession({ apiKey: "", amount: "10.00" }),
    /API key is required/,
  );
});

test("createCheckoutSession handles request failure gracefully", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return {
      ok: false,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ error: "Invalid API key" }),
    } as unknown as Response;
  };

  try {
    await assert.rejects(
      () => createCheckoutSession({ apiKey: "tk_live_invalid", amount: "10.00" }),
      /Invalid API key/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
