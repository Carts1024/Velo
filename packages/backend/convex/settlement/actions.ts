"use node";

import { randomUUID } from "crypto";

import { PdaxClient, PdaxError } from "@repo/pdax";
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
      let response;
      try {
        response = await client.firmQuote(accessToken, idToken, {
          side: args.side,
          quote_currency: args.quoteCurrency,
          base_currency: args.baseCurrency,
          currency: args.currency,
          quantity: args.quantity,
        });
      } catch (err) {
        if (err instanceof PdaxError) {
          const bodyStr = typeof err.body === "string" ? err.body : JSON.stringify(err.body);
          console.error(`PDAX firmQuote failed [${err.status}]: ${bodyStr}`, {
            side: args.side,
            quoteCurrency: args.quoteCurrency,
            currency: args.currency,
            quantity: args.quantity,
          });
          throw new Error(`PDAX firmQuote failed (${err.status}): ${bodyStr}`);
        }
        throw err;
      }

      const expiresAt = Date.parse(response.data.expires_at);

      const quoteDocId: Id<"settlementQuotes"> = await ctx.runMutation(
        internal.settlement_quotes.mutation.create,
        {
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
        },
      );

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

      // Trigger Webhook
      await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
        projectId: args.projectId,
        eventType: "settlement.quote.created",
        paymentIntentId: args.paymentIntentId,
        settlementQuoteId: quoteDocId,
      });

      return { quote: response.data, transactionId };
    } else {
      // Request indicative quote
      let response;
      try {
        response = await client.indicativeQuote(accessToken, idToken, {
          side: args.side,
          quote_currency: args.quoteCurrency,
          base_currency: args.baseCurrency,
          currency: args.currency,
          quantity: args.quantity,
        });
      } catch (err) {
        if (err instanceof PdaxError) {
          const bodyStr = typeof err.body === "string" ? err.body : JSON.stringify(err.body);
          console.error(`PDAX indicativeQuote failed [${err.status}]: ${bodyStr}`, {
            side: args.side,
            quoteCurrency: args.quoteCurrency,
            currency: args.currency,
            quantity: args.quantity,
          });
          throw new Error(`PDAX indicativeQuote failed (${err.status}): ${bodyStr}`);
        }
        throw err;
      }

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
    const EXPIRY_BUFFER_MS = 3000; // 3s safety margin for network latency
    if (Date.now() + EXPIRY_BUFFER_MS > quote.expiresAt) {
      await ctx.runMutation(internal.settlement_quotes.mutation.updateStatus, {
        quoteId: args.quoteId,
        status: "expired",
      });
      throw new Error("Quote has expired (or too close to expiry to safely execute)");
    }

    // 4. Retrieve tokens and execute trade
    const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(ctx, args.projectId);
    const pdaxIdempotencyId = randomUUID();
    let response;
    try {
      response = await client.executeTrade(accessToken, idToken, {
        quote_id: args.quoteId,
        side: quote.side as "buy" | "sell",
        idempotency_id: pdaxIdempotencyId,
      });
    } catch (err) {
      if (err instanceof PdaxError) {
        const bodyStr = typeof err.body === "string" ? err.body : JSON.stringify(err.body);
        console.error(`PDAX executeTrade failed [${err.status}]: ${bodyStr}`, {
          quoteId: args.quoteId,
          side: quote.side,
          idempotencyId: pdaxIdempotencyId,
        });
        // If quote expired on PDAX side, mark it expired locally too
        if (err.status === 400) {
          await ctx.runMutation(internal.settlement_quotes.mutation.updateStatus, {
            quoteId: args.quoteId,
            status: "expired",
          });
        }
        throw new Error(`PDAX trade failed (${err.status}): ${bodyStr}`);
      }
      throw err;
    }

    const trade = response.data;

    // 5. Update quote and transaction records
    await ctx.runMutation(internal.settlement_quotes.mutation.updateStatus, {
      quoteId: args.quoteId,
      status: "executed",
    });

    const txDocId: Id<"settlementTransactions"> = await ctx.runMutation(
      internal.settlement_transactions.mutation.create,
      {
        projectId: args.projectId,
        paymentIntentId: quote.paymentIntentId,
        provider: "pdax",
        status: "TRADE_EXECUTED",
        idempotencyId: args.idempotencyId,
        quoteId: args.quoteId,
      },
    );

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

    // Trigger Webhook
    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: args.projectId,
      eventType: "settlement.trade.executed",
      paymentIntentId: quote.paymentIntentId,
      settlementTransactionId: txDocId,
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
      sender_middle_name: "n.a.",
      sender_last_name: "Merchant",
      sender_country_origin: "Philippines",
      source_of_funds: "Business Income",
      fee_type: "Sender",
      beneficiary_first_name: args.beneficiaryFirstName,
      beneficiary_middle_name: "n.a.",
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
    const txDocId: Id<"settlementTransactions"> = await ctx.runMutation(
      internal.settlement_transactions.mutation.create,
      {
        projectId: args.projectId,
        paymentIntentId: args.paymentIntentId,
        provider: "pdax",
        status: "PAYOUT_PENDING",
        idempotencyId: args.idempotencyId,
      },
    );

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

    // Trigger Webhook
    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: args.projectId,
      eventType: "settlement.withdrawal.pending",
      paymentIntentId: args.paymentIntentId,
      settlementTransactionId: txDocId,
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

export const handlePdaxWebhook = action({
  args: {
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const rawPayload = args.payload;
    const client = new PdaxClient();
    const payload = client.parseWebhook(rawPayload);

    const identifier = payload.identifier;
    if (!identifier) {
      throw new Error("Missing identifier in webhook payload");
    }

    // 1. Try to find the settlement transaction matching the identifier
    let tx = await ctx.runQuery(internal.settlement_transactions.query.getByAnyIdentifier, {
      identifier,
    });

    let projectId;
    let paymentIntentId;

    if (tx) {
      projectId = tx.projectId;
      paymentIntentId = tx.paymentIntentId;
    } else {
      // Fallback: If it's a DEPOSIT (e.g. crypto deposit), there might not be a matching transaction.
      // Look up first project in the system to make it robust for hackathon UAT demo.
      const projects = await ctx.runQuery(internal.projects.query.listAll);
      const firstProject = projects?.[0];
      if (firstProject) {
        projectId = firstProject._id;
      } else {
        throw new Error("No projects found to associate webhook event with");
      }
    }

    const eventId =
      payload.request_id ||
      ("reference_number" in payload ? payload.reference_number : "") ||
      ("reference_id" in payload ? payload.reference_id : "") ||
      identifier;

    const rawEventType = payload.transaction_type;
    const upperRawEventType = String(rawEventType || "").toUpperCase();
    let eventType: "DEPOSIT" | "WITHDRAWAL" | "TRADE" = "TRADE";

    if (upperRawEventType === "WITHDRAWAL" || upperRawEventType === "CASHOUT") {
      eventType = "WITHDRAWAL";
    } else if (upperRawEventType === "DEPOSIT" || upperRawEventType === "CASHIN") {
      eventType = "DEPOSIT";
    } else if (upperRawEventType === "TRADE") {
      eventType = "TRADE";
    }

    // 2. Record the provider event with duplicate protection
    const recordResult = await ctx.runMutation(internal.provider_events.mutation.recordEvent, {
      projectId,
      provider: "pdax",
      eventId,
      type: eventType,
      rawEvent: JSON.stringify(payload),
      processed: false,
    });

    if (recordResult.alreadyRecorded) {
      return { status: "duplicate", eventId };
    }

    // 3. Process the event if it's new
    if (eventType === "WITHDRAWAL" && tx) {
      const status = payload.status; // "COMPLETED", "FAILED", "PENDING"
      const upperStatus = String(status || "").toUpperCase();
      let newStatus: "PAYOUT_SUCCEEDED" | "PAYOUT_FAILED" | "PAYOUT_PENDING" = "PAYOUT_PENDING";
      let webhookType:
        | "settlement.withdrawal.succeeded"
        | "settlement.withdrawal.failed"
        | "settlement.withdrawal.pending" = "settlement.withdrawal.pending";

      if (
        upperStatus === "COMPLETED" ||
        upperStatus === "SUCCESSFUL" ||
        upperStatus === "SUCCESS"
      ) {
        newStatus = "PAYOUT_SUCCEEDED";
        webhookType = "settlement.withdrawal.succeeded";
      } else if (upperStatus === "FAILED" || upperStatus === "FAIL") {
        newStatus = "PAYOUT_FAILED";
        webhookType = "settlement.withdrawal.failed";
      } else {
        newStatus = "PAYOUT_PENDING";
        webhookType = "settlement.withdrawal.pending";
      }

      const pFee = "fee" in payload ? payload.fee : 0;
      const pRef = "reference_number" in payload ? payload.reference_number : undefined;

      const existingDetails = tx.withdrawalDetails ?? {
        referenceNumber: undefined as string | undefined,
        amount: payload.amount ?? 0,
        fee: pFee,
        bankCode: "BASECPH",
        accountName: "n/a",
        accountNumber: "n/a",
      };

      await ctx.runMutation(internal.settlement_transactions.mutation.updateStatus, {
        idempotencyId: tx.idempotencyId,
        status: newStatus,
        withdrawalId: identifier,
        withdrawalDetails: {
          referenceNumber: pRef || existingDetails.referenceNumber,
          amount: payload.amount ?? existingDetails.amount,
          fee: pFee ?? existingDetails.fee,
          status,
          bankCode: existingDetails.bankCode,
          accountName: existingDetails.accountName,
          accountNumber: existingDetails.accountNumber,
        },
      });

      // Dispatch Velo merchant webhook
      await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
        projectId,
        eventType: webhookType,
        paymentIntentId,
        settlementTransactionId: tx._id,
      });
    }

    // Mark provider event as processed
    await ctx.runMutation(internal.provider_events.mutation.markProcessed, {
      eventId,
    });

    // Trigger raw provider event webhook delivery
    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId,
      eventType: "provider.pdax.event.received",
      paymentIntentId,
      providerEventId: recordResult.id,
    });

    return { status: "processed", eventId };
  },
});

export const mockPdaxWebhook = action({
  args: {
    projectId: v.id("projects"),
    identifier: v.string(),
    transactionType: v.union(v.literal("DEPOSIT"), v.literal("WITHDRAWAL"), v.literal("TRADE")),
    status: v.string(), // "COMPLETED", "FAILED", "PENDING"
    amount: v.number(),
    fee: v.number(),
    referenceNumber: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    // Authenticate project owner
    const project = await ctx.runQuery(api.projects.query.getById, { id: args.projectId });
    if (!project) {
      throw new Error("Project not found");
    }

    // Build mock payload resembling PDAX payload shapes
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const referenceNumber = args.referenceNumber || `ref-${Date.now()}`;

    let payload: Record<string, unknown> = {};

    if (args.transactionType === "WITHDRAWAL") {
      payload = {
        identifier: args.identifier,
        user_id: "99a57ed4-4beb-4b4e-8d5d-bea296ba79be",
        request_id: requestId,
        reference_number: referenceNumber,
        amount: args.amount,
        asset: "PHP",
        asset_type: "FIAT",
        transaction_type: "WITHDRAWAL",
        status: args.status,
        method: "PAY-TO-ACCOUNT-REAL-TIME",
        fee: args.fee,
      };
    } else {
      payload = {
        identifier: args.identifier,
        user_id: "99a57ed4-4beb-4b4e-8d5d-bea296ba79be",
        reference_id: referenceNumber,
        request_id: requestId,
        transaction_type: args.transactionType,
        transaction_hash: `hash-${Date.now()}`,
        amount: args.amount,
        fee_amount: args.fee,
        asset_type: "crypto",
        asset: "USDCXLM",
        network: "XLM_USDC_T_CEKS",
        source_address: "GA54SPC34JL3I57ENALTO2V26XOFFG4VGQLFQXDGF6KJ5TJY7ODY56ST",
        destination_address: "GDC326O65O223UFTB6Z6YV6SP7DOKHGL3Q74Z3J6V3AOS5W5YST6SGA5",
        status: args.status.toLowerCase(),
      };
    }

    // Process webhook payload locally using the handlePdaxWebhook action logic
    return await ctx.runAction(api.settlement.actions.handlePdaxWebhook, {
      payload,
    });
  },
});
