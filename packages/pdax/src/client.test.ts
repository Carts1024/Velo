import assert from "node:assert";
import { test, describe, afterEach } from "node:test";

import { PdaxClient, PdaxError } from "./client.ts";

const BASE_URL = "https://uat.services.sandbox.pdax.ph/api/pdax-api";

describe("PdaxClient", () => {
  let mockFetchCall: { url: string; options: RequestInit | undefined } | null = null;
  let mockResponse: { ok: boolean; status: number; json: unknown; text?: string } | null = null;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    mockFetchCall = { url: input.toString(), options: init };
    if (!mockResponse) {
      throw new Error("Mock response not set");
    }
    return {
      ok: mockResponse.ok,
      status: mockResponse.status,
      json: async () => mockResponse!.json,
      text: async () => mockResponse!.text || JSON.stringify(mockResponse!.json),
    } as Response;
  };

  afterEach(() => {
    mockFetchCall = null;
    mockResponse = null;
  });

  test("login success", async () => {
    const client = new PdaxClient(BASE_URL);
    const mockPayload = {
      email: "example@gmail.com",
      username: "96a8c8b5-8fee-40c9-9242-a5cd172e9a96",
      groups: ["exchange_user"],
      token_type: "Bearer",
      preferred_mfa: "SOFTWARE_TOKEN_MFA",
      expiry: 600,
      access_token: "mock-access-token",
      id_token: "mock-id-token",
      refresh_token: "mock-refresh-token",
    };

    mockResponse = {
      ok: true,
      status: 200,
      json: mockPayload,
    };

    const res = await client.login("example@gmail.com", "P@ssw0rd");
    assert.deepStrictEqual(res, mockPayload);
    assert.strictEqual(mockFetchCall?.url, `${BASE_URL}/pdax-institution/v1/login`);
    assert.strictEqual(mockFetchCall?.options!.method, "POST");
    assert.strictEqual(
      mockFetchCall?.options!.body,
      JSON.stringify({ username: "example@gmail.com", password: "P@ssw0rd" }),
    );
  });

  test("login error mapping", async () => {
    const client = new PdaxClient(BASE_URL);
    mockResponse = {
      ok: false,
      status: 401,
      json: { message: "Invalid credentials" },
    };

    await assert.rejects(
      async () => {
        await client.login("example@gmail.com", "wrong-password");
      },
      (err: unknown) => {
        if (!(err instanceof PdaxError)) {
          return false;
        }
        assert.strictEqual(err.status, 401);
        assert.deepStrictEqual(err.body, { message: "Invalid credentials" });
        return true;
      },
    );
  });

  test("refresh success", async () => {
    const client = new PdaxClient(BASE_URL);
    const mockPayload = {
      email: "example@gmail.com",
      username: "96a8c8b5-8fee-40c9-9242-a5cd172e9a96",
      groups: ["exchange_user"],
      token_type: "Bearer",
      preferred_mfa: "SOFTWARE_TOKEN_MFA",
      expiry: 600,
      access_token: "mock-access-token",
      id_token: "mock-id-token",
      refresh_token: "mock-refresh-token",
    };

    mockResponse = {
      ok: true,
      status: 200,
      json: mockPayload,
    };

    const res = await client.refresh("example@gmail.com", "mock-refresh-token");
    assert.deepStrictEqual(res, mockPayload);
    assert.strictEqual(mockFetchCall?.url, `${BASE_URL}/pdax-institution/v1/refresh-token`);
    assert.strictEqual(mockFetchCall?.options!.method, "PUT");
    assert.strictEqual(
      mockFetchCall?.options!.body,
      JSON.stringify({ username: "example@gmail.com", refreshToken: "mock-refresh-token" }),
    );
  });

  test("balances list", async () => {
    const client = new PdaxClient(BASE_URL);
    const mockBalances = {
      status: "success",
      data: [
        {
          currency: "USDCXLM",
          available: "1000001",
          hold: "0",
          total: "1000001",
          asset_type: "CRYPTO",
        },
      ],
    };

    mockResponse = {
      ok: true,
      status: 200,
      json: mockBalances,
    };

    const res = await client.balances("mock-access", "mock-id");
    assert.deepStrictEqual(res, mockBalances);
    assert.strictEqual(mockFetchCall?.url, `${BASE_URL}/pdax-institution/v1/balances`);
    const headers = mockFetchCall?.options!.headers as Record<string, string>;
    assert.strictEqual(headers.access_token, "mock-access");
    assert.strictEqual(headers.id_token, "mock-id");
  });

  test("crypto deposit address", async () => {
    const client = new PdaxClient(BASE_URL);
    const mockDeposit = {
      status: "success",
      data: {
        currency: "USDCXLM",
        address: "GA54SPC34JL3I57ENALTO2V26XOFFG4VGQLFQXDGF6KJ5TJY7ODY56ST",
        tag: "123123123",
      },
    };

    mockResponse = {
      ok: true,
      status: 200,
      json: mockDeposit,
    };

    const res = await client.cryptoDepositAddress("mock-access", "mock-id", "USDCXLM");
    assert.deepStrictEqual(res, mockDeposit);
    assert.strictEqual(
      mockFetchCall?.url,
      `${BASE_URL}/pdax-institution/v1/crypto/deposit?currency=USDCXLM`,
    );
  });

  test("indicative price v2", async () => {
    const client = new PdaxClient(BASE_URL);
    const mockQuote = {
      status: "success",
      data: {
        quote_currency: "USDCXLM",
        base_currency: "PHP",
        side: "buy",
        base_quantity: 17.18,
        price: 58.196,
        total_amount: 1000,
      },
    };

    mockResponse = {
      ok: true,
      status: 200,
      json: mockQuote,
    };

    const res = await client.indicativeQuote("mock-access", "mock-id", {
      side: "buy",
      quote_currency: "USDCXLM",
      base_currency: "PHP",
      currency: "PHP",
      quantity: 1000,
    });
    assert.deepStrictEqual(res, mockQuote);
    assert.strictEqual(
      mockFetchCall?.url,
      `${BASE_URL}/pdax-institution/v2/trade/price?side=buy&quote_currency=USDCXLM&base_currency=PHP&currency=PHP&quantity=1000`,
    );
  });

  test("firm quote v2", async () => {
    const client = new PdaxClient(BASE_URL);
    const mockQuote = {
      status: "success",
      data: {
        quote_id: "018fa0b8-b6e0-70e7-ad7e-1a9803695a86",
        expires_at: "2024-05-22T14:33:46.111Z",
        quote_currency: "USDCXLM",
        base_currency: "PHP",
        side: "buy",
        base_quantity: 17.18,
        price: 58.196,
        total_amount: 1000,
      },
    };

    mockResponse = {
      ok: true,
      status: 200,
      json: mockQuote,
    };

    const params = {
      side: "buy" as const,
      quote_currency: "USDCXLM",
      base_currency: "PHP" as const,
      currency: "PHP",
      quantity: 1000,
    };

    const res = await client.firmQuote("mock-access", "mock-id", params);
    assert.deepStrictEqual(res, mockQuote);
    assert.strictEqual(mockFetchCall?.url, `${BASE_URL}/pdax-institution/v2/trade/quote`);
    assert.strictEqual(mockFetchCall?.options!.method, "POST");
    assert.strictEqual(mockFetchCall?.options!.body, JSON.stringify(params));
  });

  test("execute trade", async () => {
    const client = new PdaxClient(BASE_URL);
    const mockTrade = {
      status: "success",
      data: {
        order_id: 122121,
        status: "successful",
        quote_currency: "USDCXLM",
        base_currency: "PHP",
        side: "buy",
        base_quantity: 17.18,
        price: 58.196,
        total_amount: 1000,
        created_at: "2024-05-22T14:33:50.000Z",
        updated_at: "2024-05-22T14:33:50.000Z",
      },
    };

    mockResponse = {
      ok: true,
      status: 200,
      json: mockTrade,
    };

    const params = {
      quote_id: "018fa0b8-b6e0-70e7-ad7e-1a9803695a86",
      side: "buy" as const,
      idempotency_id: "417699ae-c57a-4304-bf44-b75faf5a4d7f",
    };

    const res = await client.executeTrade("mock-access", "mock-id", params);
    assert.deepStrictEqual(res, mockTrade);
    assert.strictEqual(mockFetchCall?.url, `${BASE_URL}/pdax-institution/v1/trade`);
    assert.strictEqual(mockFetchCall?.options!.method, "POST");
    assert.strictEqual(mockFetchCall?.options!.body, JSON.stringify(params));
  });

  test("get order details", async () => {
    const client = new PdaxClient(BASE_URL);
    const mockOrder = {
      status: "success",
      data: {
        order_id: 122121,
        status: "SUCCESSFUL",
        quote_currency: "USDCXLM",
        base_currency: "PHP",
        side: "buy" as const,
        base_quantity: 17.18,
        price: 58.196,
        total_amount: 1000,
        created_at: "2024-05-22T14:33:50.000Z",
      },
    };

    mockResponse = {
      ok: true,
      status: 200,
      json: mockOrder,
    };

    const res = await client.getOrder("mock-access", "mock-id", 122121);
    assert.deepStrictEqual(res, mockOrder);
    assert.strictEqual(mockFetchCall?.url, `${BASE_URL}/pdax-institution/v1/orders/122121`);
  });

  test("fiat withdraw", async () => {
    const client = new PdaxClient(BASE_URL);
    const mockWithdraw = {
      status: "success",
      data: {
        identifier: "tx_velo_settlement_001",
        reference_number: "eyJ0IjoiYW54IiwibSI6ImNvIiwiciI6ImMydTFIektVIn0=",
        amount: 1000,
        method: "PAY-TO-ACCOUNT-REAL-TIME",
        status: "PENDING",
        fee: 15.0,
      },
    };

    mockResponse = {
      ok: true,
      status: 200,
      json: mockWithdraw,
    };

    const params = {
      identifier: "tx_velo_settlement_001",
      sender_first_name: "Velo",
      sender_last_name: "Merchant",
      sender_country_origin: "Philippines",
      source_of_funds: "Business Income",
      fee_type: "Sender" as const,
      beneficiary_first_name: "John",
      beneficiary_last_name: "Doe",
      beneficiary_bank_code: "BASECPH",
      beneficiary_account_name: "John Doe",
      beneficiary_account_number: "0000042001461",
      purpose: "Business Transaction",
      relationship_of_sender_to_beneficiary: "Myself",
      currency: "PHP" as const,
      amount: "1000.00",
      method: "PAY-TO-ACCOUNT-REAL-TIME",
    };

    const res = await client.fiatWithdraw("mock-access", "mock-id", params);
    assert.deepStrictEqual(res, mockWithdraw);
    assert.strictEqual(mockFetchCall?.url, `${BASE_URL}/pdax-institution/v1/fiat/withdraw`);
    assert.strictEqual(mockFetchCall?.options!.body, JSON.stringify(params));
  });

  test("normalizes an allowlisted crypto webhook", () => {
    const client = new PdaxClient(BASE_URL);
    const rawPayload = {
      identifier: "tx_crypto_dep_001",
      user_id: "provider-user-1",
      reference_id: "reference-1",
      request_id: "request-1",
      transaction_type: "DEPOSIT",
      transaction_hash: "stellar-transaction-hash",
      amount: 25.5,
      fee_amount: 0,
      asset_type: "crypto",
      asset: "USDCXLM",
      network: "stellar",
      source_address: "G_SOURCE",
      destination_address: "G_DESTINATION",
      status: "completed",
      attacker_controlled: "discard me",
    };
    const parsed = client.parseWebhook(JSON.stringify(rawPayload));
    assert.deepStrictEqual(parsed, {
      identifier: "tx_crypto_dep_001",
      user_id: "provider-user-1",
      reference_id: "reference-1",
      request_id: "request-1",
      transaction_type: "DEPOSIT",
      transaction_hash: "stellar-transaction-hash",
      amount: 25.5,
      fee_amount: 0,
      asset_type: "crypto",
      asset: "USDCXLM",
      network: "stellar",
      source_address: "G_SOURCE",
      destination_address: "G_DESTINATION",
      status: "completed",
    });
  });

  test("normalizes an allowlisted fiat webhook", () => {
    const client = new PdaxClient(BASE_URL);
    const parsed = client.parseWebhook({
      identifier: "payout-1",
      user_id: "provider-user-1",
      request_id: "request-1",
      reference_number: "reference-1",
      amount: 1_000,
      asset: "PHP",
      asset_type: "FIAT",
      transaction_type: "WITHDRAWAL",
      status: "PENDING",
      method: "PAY-TO-ACCOUNT-REAL-TIME",
      fee: 15,
      ignored: { nested: "data" },
    });
    assert.deepStrictEqual(parsed, {
      identifier: "payout-1",
      user_id: "provider-user-1",
      request_id: "request-1",
      reference_number: "reference-1",
      amount: 1_000,
      asset: "PHP",
      asset_type: "FIAT",
      transaction_type: "WITHDRAWAL",
      status: "PENDING",
      method: "PAY-TO-ACCOUNT-REAL-TIME",
      fee: 15,
    });
  });

  test("rejects malformed and stale webhook shapes", () => {
    const client = new PdaxClient(BASE_URL);
    const validFiat = {
      identifier: "payout-1",
      user_id: "provider-user-1",
      request_id: "request-1",
      reference_number: "reference-1",
      amount: 1_000,
      asset: "PHP",
      asset_type: "FIAT",
      transaction_type: "WITHDRAWAL",
      status: "COMPLETED",
      method: "INSTAPAY",
      fee: 15,
    };

    for (const payload of [null, [], "not-json", 12]) {
      assert.throws(() => client.parseWebhook(payload), /Invalid PDAX webhook/);
    }
    assert.throws(() => client.parseWebhook({ ...validFiat, identifier: "" }), /identifier/);
    assert.throws(() => client.parseWebhook({ ...validFiat, request_id: undefined }), /request_id/);
    assert.throws(() => client.parseWebhook({ ...validFiat, asset_type: "fiat" }), /asset_type/);
    assert.throws(
      () => client.parseWebhook({ ...validFiat, transaction_type: "TRADE" }),
      /transaction_type/,
    );
    assert.throws(() => client.parseWebhook({ ...validFiat, status: "SUCCESS" }), /status/);
    assert.throws(() => client.parseWebhook({ ...validFiat, amount: "1000" }), /amount/);
    assert.throws(() => client.parseWebhook({ ...validFiat, fee: -1 }), /fee/);
    assert.throws(
      () => client.parseWebhook({ ...validFiat, reference_number: "x".repeat(513) }),
      /reference_number/,
    );
  });

  test("does not claim native signature verification", () => {
    const client = new PdaxClient(BASE_URL);
    assert.strictEqual(client.verifyWebhook({}, {}), false);
  });

  test("applies a total deadline to login", async () => {
    globalThis.fetch = async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    const client = new PdaxClient(BASE_URL, { timeoutMs: 10 });
    await assert.rejects(client.login("user", "password"), /timed out after 10ms/);
  });

  test("propagates caller cancellation to refresh", async () => {
    globalThis.fetch = async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    const controller = new AbortController();
    const client = new PdaxClient(BASE_URL, { timeoutMs: 1_000 });
    const request = client.refresh("user", "refresh", controller.signal);
    controller.abort(new Error("caller cancelled"));
    await assert.rejects(request, /caller cancelled/);
  });
});
