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
