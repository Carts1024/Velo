import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, Horizon, Transaction } from "@stellar/stellar-sdk";

import { createCheckoutSession, buildCheckoutPaymentTransaction } from "./checkout.ts";

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
      correlationId: "sdk-2026-0001",
    });

    assert.equal(fetchCalled, true);
    assert.equal(calledUrl, "http://localhost:3000/api/v2/payment-intents");
    assert.equal(calledOptions?.method, "POST");

    const headers = calledOptions?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer tk_live_abcdef1234567890abcdef1234567890");
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["X-Correlation-Id"], "sdk-2026-0001");

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

test("buildCheckoutPaymentTransaction without memo", async () => {
  const payerAddress = Keypair.random().publicKey();
  const receiverAddress = Keypair.random().publicKey();

  const { Horizon, Account } = await import("@stellar/stellar-sdk");
  const originalLoadAccount = Horizon.Server.prototype.loadAccount;
  Horizon.Server.prototype.loadAccount = async function (address: string) {
    const account = new Account(address, "1");
    (account as unknown as { balances: Horizon.AccountResponse["balances"] }).balances = [
      { asset_type: "native", balance: "100.00" },
    ] as unknown as Horizon.AccountResponse["balances"];
    return account as unknown as Horizon.AccountResponse;
  };

  try {
    const xdr = await buildCheckoutPaymentTransaction({
      payerAddress,
      receiverAddress,
      amount: "10.00",
      asset: "native",
    });

    const { TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    assert.equal(tx.memo.type, "none");
  } finally {
    Horizon.Server.prototype.loadAccount = originalLoadAccount;
  }
});

test("buildCheckoutPaymentTransaction with numeric memo (Memo.id)", async () => {
  const payerAddress = Keypair.random().publicKey();
  const receiverAddress = Keypair.random().publicKey();

  const { Horizon, Account } = await import("@stellar/stellar-sdk");
  const originalLoadAccount = Horizon.Server.prototype.loadAccount;
  Horizon.Server.prototype.loadAccount = async function (address: string) {
    const account = new Account(address, "1");
    (account as unknown as { balances: Horizon.AccountResponse["balances"] }).balances = [
      { asset_type: "native", balance: "100.00" },
    ] as unknown as Horizon.AccountResponse["balances"];
    return account as unknown as Horizon.AccountResponse;
  };

  try {
    const xdr = await buildCheckoutPaymentTransaction({
      payerAddress,
      receiverAddress,
      amount: "10.00",
      asset: "native",
      memo: "123456789",
    });

    const { TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    assert.equal(tx.memo.type, "id");
    assert.equal(tx.memo.value?.toString(), "123456789");
  } finally {
    Horizon.Server.prototype.loadAccount = originalLoadAccount;
  }
});

test("buildCheckoutPaymentTransaction with text memo (Memo.text)", async () => {
  const payerAddress = Keypair.random().publicKey();
  const receiverAddress = Keypair.random().publicKey();

  const { Horizon, Account } = await import("@stellar/stellar-sdk");
  const originalLoadAccount = Horizon.Server.prototype.loadAccount;
  Horizon.Server.prototype.loadAccount = async function (address: string) {
    const account = new Account(address, "1");
    (account as unknown as { balances: Horizon.AccountResponse["balances"] }).balances = [
      { asset_type: "native", balance: "100.00" },
    ] as unknown as Horizon.AccountResponse["balances"];
    return account as unknown as Horizon.AccountResponse;
  };

  try {
    const xdr = await buildCheckoutPaymentTransaction({
      payerAddress,
      receiverAddress,
      amount: "10.00",
      asset: "native",
      memo: "hello-pdax",
    });

    const { TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    assert.equal(tx.memo.type, "text");
    assert.equal(tx.memo.value?.toString(), "hello-pdax");
  } finally {
    Horizon.Server.prototype.loadAccount = originalLoadAccount;
  }
});
