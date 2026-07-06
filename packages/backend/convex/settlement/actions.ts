"use node";

import { v } from "convex/values";

import { api, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { getOrRefreshPdaxConnection } from "./helpers";

export const connect = action({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate project owner
    const project = await ctx.runQuery(api.projects.query.getById, { id: args.projectId });
    if (!project) {
      throw new Error("Unauthorized or project not found");
    }

    // 2. Establish connection (performs login and caches tokens)
    await getOrRefreshPdaxConnection(ctx, args.projectId);

    return { status: "connected" };
  },
});

export const getBalances = action({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate project owner
    const project = await ctx.runQuery(api.projects.query.getById, { id: args.projectId });
    if (!project) {
      throw new Error("Unauthorized or project not found");
    }

    // 2. Retrieve tokens and client
    const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(ctx, args.projectId);

    // 3. Fetch balances
    const response = await client.balances(accessToken, idToken);
    return response.data;
  },
});

export const getQuote = action({
  args: {
    projectId: v.id("projects"),
    paymentIntentId: v.optional(v.id("paymentIntents")),
    side: v.union(v.literal("buy"), v.literal("sell")),
    quoteCurrency: v.string(), // e.g. "USDCXLM"
    baseCurrency: v.literal("PHP"),
    quantity: v.number(),
    currency: v.string(), // USDCXLM or PHP
    firm: v.boolean(),
    idempotencyId: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    // 1. Authenticate project owner
    const project = await ctx.runQuery(api.projects.query.getById, { id: args.projectId });
    if (!project) {
      throw new Error("Unauthorized or project not found");
    }

    // 2. Optional paid PaymentIntent check
    if (args.paymentIntentId) {
      const intent = await ctx.runQuery(api.payment_intents.queries.getPaymentIntent, {
        paymentIntentId: args.paymentIntentId,
      });
      if (!intent || intent.projectId !== args.projectId) {
        throw new Error("Payment intent not found or unauthorized");
      }
      if (intent.status !== "paid") {
        throw new Error("Payment intent must be paid to initiate settlement");
      }
    }

    // 3. Retrieve tokens and client
    const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(ctx, args.projectId);

    // 4. Handle Firm vs Indicative Quote
    if (args.firm) {
      // Check existing transaction for idempotency
      const existingTx: Doc<"settlementTransactions"> | null = await ctx.runQuery(
        internal.settlement_transactions.query.getByIdempotencyId,
        { idempotencyId: args.idempotencyId },
      );

      if (existingTx && existingTx.quoteId) {
        const quote: Doc<"settlementQuotes"> | null = await ctx.runQuery(
          internal.settlement_quotes.query.getByQuoteId,
          { quoteId: existingTx.quoteId },
        );
        if (quote) {
          return { quote, transactionId: existingTx._id };
        }
      }

      // Request firm quote
      const response = await client.firmQuote(accessToken, idToken, {
        side: args.side,
        quote_currency: args.quoteCurrency,
        base_currency: args.baseCurrency,
        currency: args.currency,
        quantity: args.quantity,
      });

      const expiresAt = Date.parse(response.data.expires_at);

      await ctx.runMutation(internal.settlement_quotes.mutation.create, {
        projectId: args.projectId,
        paymentIntentId: args.paymentIntentId,
        provider: "pdax",
        quoteId: response.data.quote_id,
        side: response.data.side,
        quoteCurrency: response.data.quote_currency,
        baseCurrency: response.data.base_currency,
        quantity: args.quantity.toString(),
        price: response.data.price,
        totalAmount: response.data.total_amount,
        expiresAt,
        status: "active",
      });

      // Save settlement transaction
      const transactionId: Id<"settlementTransactions"> = await ctx.runMutation(
        internal.settlement_transactions.mutation.create,
        {
          projectId: args.projectId,
          paymentIntentId: args.paymentIntentId,
          provider: "pdax",
          status: "QUOTE_FIRM",
          idempotencyId: args.idempotencyId,
          quoteId: response.data.quote_id,
        },
      );

      return { quote: response.data, transactionId };
    } else {
      // Request indicative quote
      const response = await client.indicativeQuote(accessToken, idToken, {
        side: args.side,
        quote_currency: args.quoteCurrency,
        base_currency: args.baseCurrency,
        currency: args.currency,
        quantity: args.quantity,
      });

      return { quote: response.data };
    }
  },
});

export const executeTrade = action({
  args: {
    projectId: v.id("projects"),
    quoteId: v.string(),
    idempotencyId: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    // 1. Authenticate project owner
    const project = await ctx.runQuery(api.projects.query.getById, { id: args.projectId });
    if (!project) {
      throw new Error("Unauthorized or project not found");
    }

    // 2. Check existing transaction for idempotency
    const existingTx: Doc<"settlementTransactions"> | null = await ctx.runQuery(
      internal.settlement_transactions.query.getByIdempotencyId,
      { idempotencyId: args.idempotencyId },
    );
    if (existingTx && existingTx.status === "TRADE_EXECUTED" && existingTx.tradeDetails) {
      return existingTx.tradeDetails;
    }

    // 3. Fetch stored firm quote and validate
    const quote = await ctx.runQuery(internal.settlement_quotes.query.getByQuoteId, {
      quoteId: args.quoteId,
    });
    if (!quote) {
      throw new Error("Quote not found");
    }
    if (quote.status !== "active") {
      throw new Error(`Quote is not active (current status: ${quote.status})`);
    }
    if (Date.now() > quote.expiresAt) {
      await ctx.runMutation(internal.settlement_quotes.mutation.updateStatus, {
        quoteId: args.quoteId,
        status: "expired",
      });
      throw new Error("Quote has expired");
    }

    // 4. Retrieve tokens and execute trade
    const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(ctx, args.projectId);
    const response = await client.executeTrade(accessToken, idToken, {
      quote_id: args.quoteId,
      side: quote.side,
      idempotency_id: args.idempotencyId,
    });

    const trade = response.data;

    // 5. Update quote and transaction records
    await ctx.runMutation(internal.settlement_quotes.mutation.updateStatus, {
      quoteId: args.quoteId,
      status: "executed",
    });

    await ctx.runMutation(internal.settlement_transactions.mutation.create, {
      projectId: args.projectId,
      paymentIntentId: quote.paymentIntentId,
      provider: "pdax",
      status: "TRADE_EXECUTED",
      idempotencyId: args.idempotencyId,
      quoteId: args.quoteId,
    });

    await ctx.runMutation(internal.settlement_transactions.mutation.updateStatus, {
      idempotencyId: args.idempotencyId,
      status: "TRADE_EXECUTED",
      orderId: trade.order_id,
      tradeDetails: {
        orderId: trade.order_id,
        price: trade.price,
        amount: trade.total_amount,
        quantity: trade.base_quantity,
        status: trade.status,
      },
    });

    return trade;
  },
});

export const fiatWithdraw = action({
  args: {
    projectId: v.id("projects"),
    idempotencyId: v.string(),
    amount: v.number(),
    bankCode: v.string(), // e.g. BASECPH
    accountName: v.string(),
    accountNumber: v.string(),
    beneficiaryFirstName: v.string(),
    beneficiaryLastName: v.string(),
    paymentIntentId: v.optional(v.id("paymentIntents")),
  },
  handler: async (ctx, args): Promise<unknown> => {
    // 1. Authenticate project owner
    const project = await ctx.runQuery(api.projects.query.getById, { id: args.projectId });
    if (!project) {
      throw new Error("Unauthorized or project not found");
    }

    // 2. Check existing transaction for idempotency
    const existingTx: Doc<"settlementTransactions"> | null = await ctx.runQuery(
      internal.settlement_transactions.query.getByIdempotencyId,
      { idempotencyId: args.idempotencyId },
    );
    if (existingTx && existingTx.status === "PAYOUT_PENDING" && existingTx.withdrawalDetails) {
      return existingTx.withdrawalDetails;
    }

    // 3. Retrieve tokens and call PDAX fiat withdrawal
    const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(ctx, args.projectId);
    const response = await client.fiatWithdraw(accessToken, idToken, {
      identifier: args.idempotencyId,
      sender_first_name: "Velo",
      sender_last_name: "Merchant",
      sender_country_origin: "Philippines",
      source_of_funds: "Business Income",
      fee_type: "Sender",
      beneficiary_first_name: args.beneficiaryFirstName,
      beneficiary_last_name: args.beneficiaryLastName,
      beneficiary_bank_code: args.bankCode,
      beneficiary_account_name: args.accountName,
      beneficiary_account_number: args.accountNumber,
      purpose: "Business Transaction",
      relationship_of_sender_to_beneficiary: "Myself",
      currency: "PHP",
      amount: args.amount,
      method: "PAY-TO-ACCOUNT-REAL-TIME",
    });

    const withdrawal = response.data;

    // 4. Update transaction records
    await ctx.runMutation(internal.settlement_transactions.mutation.create, {
      projectId: args.projectId,
      paymentIntentId: args.paymentIntentId,
      provider: "pdax",
      status: "PAYOUT_PENDING",
      idempotencyId: args.idempotencyId,
    });

    await ctx.runMutation(internal.settlement_transactions.mutation.updateStatus, {
      idempotencyId: args.idempotencyId,
      status: "PAYOUT_PENDING",
      withdrawalId: withdrawal.identifier,
      withdrawalDetails: {
        referenceNumber: withdrawal.reference_number,
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        status: withdrawal.status,
        bankCode: args.bankCode,
        accountName: args.accountName,
        accountNumber: args.accountNumber,
      },
    });

    return withdrawal;
  },
});

export const getOrder = action({
  args: {
    projectId: v.id("projects"),
    orderId: v.number(),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate project owner
    const project = await ctx.runQuery(api.projects.query.getById, { id: args.projectId });
    if (!project) {
      throw new Error("Unauthorized or project not found");
    }

    // 2. Retrieve tokens and client
    const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(ctx, args.projectId);

    // 3. Fetch order status
    const response = await client.getOrder(accessToken, idToken, args.orderId);
    return response.data;
  },
});
