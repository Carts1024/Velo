export type PaymentIntentStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled";

export type PaymentIntent = {
  id: string;
  object: "payment_intent";
  paymentIntentId: string;
  status: PaymentIntentStatus;
  amount: string;
  asset: string;
  description: string | null;
  checkoutUrl: string | null;
  successUrl: string | null;
  cancelUrl: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type VeloConfig = {
  apiKey: string;
  baseUrl?: string;
  environment?: "production" | "testnet" | "development" | string;
  timeoutMs?: number;
};

export type CreateCheckoutSessionParams = {
  amount: string;
  asset?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
};

export type RequestOptions = {
  idempotencyKey?: string;
};

export type ListPaymentIntentsQuery = {
  status?: PaymentIntentStatus;
  limit?: number;
  cursor?: string;
};

export type ListResponse<T> = {
  object: "list";
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type WebhookEventType =
  | "payment.created"
  | "payment.succeeded"
  | "payment.failed"
  | "payment_access.activated"
  | "payment.access_activated"
  | "contract.event";

export type WebhookEventBase = {
  id: string;
  type: WebhookEventType;
  test: boolean;
  sentAt: string;
  project: {
    id: string;
    registryProjectId: string;
    name: string;
    slug: string;
  };
};

export type WebhookPaymentIntentData = {
  id: string;
  amount: string;
  asset: string;
  receiverAddress: string;
  merchantName: string;
  description: string | null;
  status: PaymentIntentStatus;
  payerAddress?: string;
  txHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type WebhookPaymentEvent = WebhookEventBase & {
  type:
    | "payment.created"
    | "payment.succeeded"
    | "payment.failed"
    | "payment_access.activated"
    | "payment.access_activated";
  paymentIntent: WebhookPaymentIntentData;
};

export type WebhookContractEvent = WebhookEventBase & {
  type: "contract.event";
  contractId: string;
  transactionHash: string;
  ledger: number;
  event: {
    id: string;
    topic: string;
    type: string;
    data: unknown;
    observedAt: string;
  };
};

export type WebhookEvent = WebhookPaymentEvent | WebhookContractEvent;

export type VerifyWebhookParams = {
  payload: string;
  signature: string | null;
  secret: string;
  toleranceSeconds?: number;
};
