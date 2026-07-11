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
  anchor?: "inhouse" | "pdax";
  receiverAddress?: string;
  receiverMemo?: string | null;
  anchorDepositCurrency?: string | null;
  payerAddress?: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type VeloConfig = {
  apiKey: string;
  baseUrl?: string;
  environment?: "production" | "testnet" | "development" | string;
  /** Total wall-clock deadline for one SDK request, including retries. Defaults to 30 seconds. */
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
};

export type CreateCheckoutSessionParams = {
  amount: string;
  asset?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  anchor?: "inhouse" | "pdax";
};

export type RequestOptions = {
  idempotencyKey?: string;
  correlationId?: string;
  signal?: AbortSignal;
  /** Overrides the client default total wall-clock deadline for this request. */
  timeoutMs?: number;
  /** Overrides the client default retry count for this request. */
  maxRetries?: number;
  /** Set for transaction submission calls whose network outcome must be reconciled, never retried. */
  submission?: boolean;
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
