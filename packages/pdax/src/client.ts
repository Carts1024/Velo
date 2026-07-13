export class PdaxError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "PdaxError";
    this.status = status;
    this.body = body;
  }
}

export interface PdaxLoginResponse {
  email: string;
  username: string;
  groups: string[];
  token_type: string;
  preferred_mfa: string;
  expiry: number; // in seconds
  access_token: string;
  id_token: string;
  refresh_token: string;
}

export interface PdaxBalanceItem {
  currency: string;
  available: string;
  hold: string;
  total: string;
  asset_type: "CRYPTO" | "FIAT" | string;
}

export interface PdaxBalancesResponse {
  status: "success" | string;
  data: PdaxBalanceItem[];
}

export interface PdaxCryptoDepositAddress {
  currency: string;
  address: string;
  tag?: string;
}

export interface PdaxCryptoDepositResponse {
  status: "success" | string;
  data: PdaxCryptoDepositAddress;
}

export interface PdaxIndicativeQuoteParams {
  side: "buy" | "sell";
  quote_currency: string; // e.g. USDCXLM
  base_currency: "PHP";
  currency: string; // the currency being sized (USDCXLM or PHP)
  quantity: string | number;
}

export interface PdaxIndicativeQuote {
  quote_currency: string;
  base_currency: string;
  side: "buy" | "sell";
  base_quantity: number;
  price: number;
  total_amount: number;
}

export interface PdaxIndicativeQuoteResponse {
  status: "success" | string;
  data: PdaxIndicativeQuote;
}

export interface PdaxFirmQuoteParams {
  side: "buy" | "sell";
  quote_currency: string;
  base_currency: "PHP";
  currency: string;
  quantity: string | number;
}

export interface PdaxFirmQuote {
  quote_id: string;
  expires_at: string; // ISO string
  quote_currency: string;
  base_currency: string;
  side: "buy" | "sell";
  base_quantity: number;
  price: number;
  total_amount: number;
}

export interface PdaxFirmQuoteResponse {
  status: "success" | string;
  data: PdaxFirmQuote;
}

export interface PdaxExecuteTradeParams {
  quote_id: string;
  side: "buy" | "sell";
  idempotency_id: string;
}

export interface PdaxOrderDetails {
  order_id: number;
  status: string; // "successful", "pending", etc.
  quote_currency: string;
  base_currency: string;
  side: "buy" | "sell";
  base_quantity: number;
  price: number;
  total_amount: number;
  created_at: string;
  updated_at?: string;
}

export interface PdaxExecuteTradeResponse {
  status: "success" | string;
  data: PdaxOrderDetails;
}

export interface PdaxOrderDetailsResponse {
  status: "success" | string;
  data: PdaxOrderDetails;
}

export interface PdaxFiatWithdrawParams {
  identifier: string; // Unique transaction ref from our end
  sender_first_name: string;
  sender_middle_name?: string;
  sender_last_name: string;
  sender_country_origin: string;
  source_of_funds: string;
  fee_type: "Sender" | "Beneficiary";
  beneficiary_first_name: string;
  beneficiary_middle_name?: string;
  beneficiary_last_name: string;
  beneficiary_bank_code: string; // e.g. BASECPH
  beneficiary_account_name: string;
  beneficiary_account_number: string;
  purpose: string;
  relationship_of_sender_to_beneficiary: string;
  currency: "PHP";
  amount: string | number;
  method: "PAY-TO-ACCOUNT-REAL-TIME" | string;
}

export interface PdaxFiatWithdrawRetryMethod {
  request_id: string;
  channel: string;
  status: string;
  fail_reason: string;
  time: string;
}

export interface PdaxFiatWithdrawData {
  identifier: string;
  reference_number: string;
  amount: number;
  method: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | string;
  fee: number;
  retry_methods?: PdaxFiatWithdrawRetryMethod[];
}

export interface PdaxFiatWithdrawResponse {
  status: "success" | string;
  data: PdaxFiatWithdrawData;
}

export interface PdaxCryptoWebhookPayload {
  identifier: string;
  user_id: string;
  reference_id: string;
  request_id: string;
  transaction_type: "DEPOSIT" | "WITHDRAWAL";
  transaction_hash: string;
  amount: number;
  fee_amount: number;
  asset_type: "crypto";
  asset: string;
  network: string;
  source_address: string;
  destination_address: string;
  status: "completed" | "pending" | "failed";
}

export interface PdaxFiatWebhookPayload {
  identifier: string;
  user_id: string;
  request_id: string;
  reference_number: string;
  amount: number;
  asset: "PHP";
  asset_type: "FIAT";
  transaction_type: "WITHDRAWAL" | "DEPOSIT";
  status: "COMPLETED" | "PENDING" | "FAILED";
  method: string;
  fee: number;
}

export interface PdaxFiatTransactionItem {
  request_id: string;
  transaction_id: number;
  amount: string;
  fee: string | null;
  method: string;
  mode: string; // "CashOut" | "CashIn"
  reference_number: string;
  fulfilled_at: string | null;
  declined_at: string | null;
  rejection_reason: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
  status: "COMPLETED" | "FAILED" | "IN-PROGRESS" | string;
  identifier: string;
  fee_type: string | null;
  retried_methods?: Array<{
    request_id: string;
    channel: string;
    status: string;
    fail_reason: string;
    time: string;
  }>;
}

export interface PdaxFiatTransactionsResponse {
  data: PdaxFiatTransactionItem[];
}

export interface PdaxFiatTransactionsParams {
  identifier?: string;
  mode?: "CashIn" | "CashOut";
  page?: number;
  pageSize?: number;
}

export type PdaxWebhookPayload = PdaxCryptoWebhookPayload | PdaxFiatWebhookPayload;

const WEBHOOK_STRING_MAX = 512;

function webhookRecord(payload: unknown): Record<string, unknown> {
  let decoded = payload;
  if (typeof payload === "string") {
    try {
      decoded = JSON.parse(payload) as unknown;
    } catch {
      throw new TypeError("Invalid PDAX webhook: payload must be valid JSON");
    }
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new TypeError("Invalid PDAX webhook: payload must be an object");
  }
  return decoded as Record<string, unknown>;
}

function webhookString(
  record: Record<string, unknown>,
  key: string,
  allowed?: readonly string[],
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0 || value.length > WEBHOOK_STRING_MAX) {
    throw new TypeError(`Invalid PDAX webhook: ${key} must be a non-empty bounded string`);
  }
  if (allowed && !allowed.includes(value)) {
    throw new TypeError(`Invalid PDAX webhook: unsupported ${key}`);
  }
  return value;
}

function webhookAmount(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`Invalid PDAX webhook: ${key} must be a nonnegative finite number`);
  }
  return value;
}

function parseCryptoWebhook(record: Record<string, unknown>): PdaxCryptoWebhookPayload {
  return {
    identifier: webhookString(record, "identifier"),
    user_id: webhookString(record, "user_id"),
    reference_id: webhookString(record, "reference_id"),
    request_id: webhookString(record, "request_id"),
    transaction_type: webhookString(record, "transaction_type", ["DEPOSIT", "WITHDRAWAL"]) as
      | "DEPOSIT"
      | "WITHDRAWAL",
    transaction_hash: webhookString(record, "transaction_hash"),
    amount: webhookAmount(record, "amount"),
    fee_amount: webhookAmount(record, "fee_amount"),
    asset_type: "crypto",
    asset: webhookString(record, "asset"),
    network: webhookString(record, "network"),
    source_address: webhookString(record, "source_address"),
    destination_address: webhookString(record, "destination_address"),
    status: webhookString(record, "status", ["completed", "pending", "failed"]) as
      | "completed"
      | "pending"
      | "failed",
  };
}

function parseFiatWebhook(record: Record<string, unknown>): PdaxFiatWebhookPayload {
  return {
    identifier: webhookString(record, "identifier"),
    user_id: webhookString(record, "user_id"),
    request_id: webhookString(record, "request_id"),
    reference_number: webhookString(record, "reference_number"),
    amount: webhookAmount(record, "amount"),
    asset: webhookString(record, "asset", ["PHP"]) as "PHP",
    asset_type: "FIAT",
    transaction_type: webhookString(record, "transaction_type", ["WITHDRAWAL", "DEPOSIT"]) as
      | "WITHDRAWAL"
      | "DEPOSIT",
    status: webhookString(record, "status", ["COMPLETED", "PENDING", "FAILED"]) as
      | "COMPLETED"
      | "PENDING"
      | "FAILED",
    method: webhookString(record, "method"),
    fee: webhookAmount(record, "fee"),
  };
}

export class PdaxClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(
    baseUrl: string = "https://uat.services.sandbox.pdax.ph/api/pdax-api",
    options: { timeoutMs?: number } = {},
  ) {
    this.baseUrl = baseUrl;
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 2_500);
  }

  private async request<T>(
    path: string,
    method: string,
    headers: Record<string, string>,
    body?: unknown,
    params?: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const controller = new AbortController();
    const onCallerAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) onCallerAbort();
    else signal?.addEventListener("abort", onCallerAbort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new Error(`PDAX request timed out after ${this.timeoutMs}ms`)),
      this.timeoutMs,
    );

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          try {
            errorBody = await response.text();
          } catch {
            errorBody = null;
          }
        }
        throw new PdaxError(
          `PDAX API request failed with status ${response.status}`,
          response.status,
          errorBody,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        throw reason instanceof Error ? reason : new Error("PDAX request aborted");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  async login(
    username: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<PdaxLoginResponse> {
    return this.request<PdaxLoginResponse>(
      "/pdax-institution/v1/login",
      "POST",
      {},
      {
        username,
        password,
      },
      undefined,
      signal,
    );
  }

  async refresh(
    username: string,
    refreshToken: string,
    signal?: AbortSignal,
  ): Promise<PdaxLoginResponse> {
    return this.request<PdaxLoginResponse>(
      "/pdax-institution/v1/refresh-token",
      "PUT",
      {},
      {
        username,
        refreshToken,
      },
      undefined,
      signal,
    );
  }

  async balances(
    accessToken: string,
    idToken: string,
    currency?: string,
  ): Promise<PdaxBalancesResponse> {
    const headers = {
      access_token: accessToken,
      id_token: idToken,
    };
    return this.request<PdaxBalancesResponse>(
      "/pdax-institution/v1/balances",
      "GET",
      headers,
      undefined,
      currency ? { currency } : undefined,
    );
  }

  async cryptoDepositAddress(
    accessToken: string,
    idToken: string,
    currency: string,
    signal?: AbortSignal,
  ): Promise<PdaxCryptoDepositResponse> {
    const headers = {
      access_token: accessToken,
      id_token: idToken,
    };
    return this.request<PdaxCryptoDepositResponse>(
      "/pdax-institution/v1/crypto/deposit",
      "GET",
      headers,
      undefined,
      { currency },
      signal,
    );
  }

  async indicativeQuote(
    accessToken: string,
    idToken: string,
    params: PdaxIndicativeQuoteParams,
  ): Promise<PdaxIndicativeQuoteResponse> {
    const headers = {
      access_token: accessToken,
      id_token: idToken,
    };
    return this.request<PdaxIndicativeQuoteResponse>(
      "/pdax-institution/v2/trade/price",
      "GET",
      headers,
      undefined,
      {
        side: params.side,
        quote_currency: params.quote_currency,
        base_currency: params.base_currency,
        currency: params.currency,
        quantity: params.quantity.toString(),
      },
    );
  }

  async firmQuote(
    accessToken: string,
    idToken: string,
    params: PdaxFirmQuoteParams,
  ): Promise<PdaxFirmQuoteResponse> {
    const headers = {
      access_token: accessToken,
      id_token: idToken,
    };
    return this.request<PdaxFirmQuoteResponse>(
      "/pdax-institution/v2/trade/quote",
      "POST",
      headers,
      params,
    );
  }

  async executeTrade(
    accessToken: string,
    idToken: string,
    params: PdaxExecuteTradeParams,
  ): Promise<PdaxExecuteTradeResponse> {
    const headers = {
      access_token: accessToken,
      id_token: idToken,
    };
    return this.request<PdaxExecuteTradeResponse>(
      "/pdax-institution/v1/trade",
      "POST",
      headers,
      params,
    );
  }

  async getOrder(
    accessToken: string,
    idToken: string,
    orderId: number,
  ): Promise<PdaxOrderDetailsResponse> {
    const headers = {
      access_token: accessToken,
      id_token: idToken,
    };
    return this.request<PdaxOrderDetailsResponse>(
      `/pdax-institution/v1/orders/${orderId}`,
      "GET",
      headers,
    );
  }

  async fiatWithdraw(
    accessToken: string,
    idToken: string,
    params: PdaxFiatWithdrawParams,
  ): Promise<PdaxFiatWithdrawResponse> {
    const headers = {
      access_token: accessToken,
      id_token: idToken,
    };
    return this.request<PdaxFiatWithdrawResponse>(
      "/pdax-institution/v1/fiat/withdraw",
      "POST",
      headers,
      params,
    );
  }

  async registerWebhook(
    accessToken: string,
    idToken: string,
    webhookUrl: string,
    eventType: "crypto" | "fiat",
  ): Promise<unknown> {
    const headers = {
      access_token: accessToken,
      id_token: idToken,
    };
    return this.request<unknown>("/pdax-institution/v1/config/webhook", "POST", headers, {
      event_type: eventType,
      webhook_endpoint: webhookUrl,
    });
  }

  async getFiatTransactions(
    accessToken: string,
    idToken: string,
    params: PdaxFiatTransactionsParams = {},
  ): Promise<PdaxFiatTransactionsResponse> {
    const headers = {
      access_token: accessToken,
      id_token: idToken,
    };
    const queryParams: Record<string, string | undefined> = {};
    if (params.identifier) queryParams.identifier = params.identifier;
    if (params.mode) queryParams.mode = params.mode;
    if (params.page !== undefined) queryParams.page = params.page.toString();
    if (params.pageSize !== undefined) queryParams.pageSize = params.pageSize.toString();

    return this.request<PdaxFiatTransactionsResponse>(
      "/pdax-institution/v1/fiat/transactions",
      "GET",
      headers,
      undefined,
      queryParams,
    );
  }

  parseWebhook(payload: unknown): PdaxWebhookPayload {
    const record = webhookRecord(payload);
    if (record.asset_type === "crypto") return parseCryptoWebhook(record);
    if (record.asset_type === "FIAT") return parseFiatWebhook(record);
    throw new TypeError("Invalid PDAX webhook: unsupported asset_type");
  }

  verifyWebhook(_payload: unknown, _headers: Record<string, string>): boolean {
    // PDAX provides no native callback signature. Authentication must be enforced by ingress,
    // and callback facts must be corroborated against durable provider records.
    return false;
  }
}
