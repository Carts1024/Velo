import type {
  VeloConfig,
  CreateCheckoutSessionParams,
  RequestOptions,
  PaymentIntent,
  ListPaymentIntentsQuery,
  ListResponse,
} from "./types.ts";

import { HttpClient } from "./http.ts";

export class Velo {
  private readonly http: HttpClient;

  constructor(config: VeloConfig) {
    if (
      !config ||
      !config.apiKey ||
      typeof config.apiKey !== "string" ||
      config.apiKey.trim() === ""
    ) {
      throw new Error("API key is required");
    }
    this.http = new HttpClient(config);
  }

  readonly checkout = {
    sessions: {
      create: async (
        _params: CreateCheckoutSessionParams,
        _options?: RequestOptions,
      ): Promise<PaymentIntent> => {
        throw new Error("checkout.sessions.create is not implemented in Sprint 2 foundation");
      },
    },
  };

  readonly paymentIntents = {
    create: async (
      _params: CreateCheckoutSessionParams,
      _options?: RequestOptions,
    ): Promise<PaymentIntent> => {
      throw new Error("paymentIntents.create is not implemented in Sprint 2 foundation");
    },
    retrieve: async (_id: string, _options?: RequestOptions): Promise<PaymentIntent> => {
      throw new Error("paymentIntents.retrieve is not implemented in Sprint 2 foundation");
    },
    list: async (
      _query?: ListPaymentIntentsQuery,
      _options?: RequestOptions,
    ): Promise<ListResponse<PaymentIntent>> => {
      throw new Error("paymentIntents.list is not implemented in Sprint 2 foundation");
    },
  };
}
