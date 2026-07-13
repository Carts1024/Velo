"use node";

import { createHash, randomUUID } from "crypto";

import { PdaxClient, PdaxError } from "@repo/pdax";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { api, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { action, internalAction } from "../_generated/server";
import { getOrRefreshPdaxConnection, mapPdaxError } from "./helpers";

const reserveOperation = makeFunctionReference<"mutation">("provider_operations/mutations:reserve");
const claimOperation = makeFunctionReference<"mutation">("provider_operations/mutations:claim");
const completeOperation = makeFunctionReference<"mutation">(
  "provider_operations/mutations:complete",
);

function fingerprint(value: Record<string, unknown>) {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

function ambiguousProviderError(error: unknown) {
  return (
    !(error instanceof PdaxError) ||
    error.status === 408 ||
    error.status === 409 ||
    error.status === 429 ||
    error.status >= 500
  );
}

function cleanReferenceNumber(newRef?: string, existingRef?: string): string | undefined {
  const isBase64 = (s?: string) => typeof s === "string" && s.startsWith("eyJ");

  if (newRef && !isBase64(newRef)) {
    return newRef;
  }
  if (existingRef && !isBase64(existingRef)) {
    return existingRef;
  }
  return newRef || existingRef;
}

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
    try {
      await getOrRefreshPdaxConnection(ctx, args.projectId);
    } catch (err) {
      throw mapPdaxError(err);
    }

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
    try {
      const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(
        ctx,
        args.projectId,
      );
      const response = await client.balances(accessToken, idToken);
      const rawBalances = response.data;

      // Fetch all paid PDAX payment intents to adjust the live UAT balance
      const paidIntents = await ctx.runQuery(internal.payment_intents.queries.getPaidPdaxIntents, {
        projectId: args.projectId,
      });

      const adjustments: Record<string, number> = {};
      for (const intent of paidIntents) {
        if (intent.anchor === "pdax" && intent.anchorDepositCurrency) {
          const currency = intent.anchorDepositCurrency;
          const amount = parseFloat(intent.amount);
          adjustments[currency] = (adjustments[currency] || 0) + amount;
        }
      }

      return rawBalances.map((balanceItem) => {
        const currency = balanceItem.currency;
        const adjustment = adjustments[currency] || 0;
        if (adjustment > 0) {
          const newAvailable = parseFloat(balanceItem.available) + adjustment;
          const newTotal = parseFloat(balanceItem.total) + adjustment;
          return {
            ...balanceItem,
            available: newAvailable.toString(),
            total: newTotal.toString(),
          };
        }
        return balanceItem;
      });
    } catch (err) {
      throw mapPdaxError(err);
    }
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
    let connectionInfo;
    try {
      connectionInfo = await getOrRefreshPdaxConnection(ctx, args.projectId);
    } catch (err) {
      throw mapPdaxError(err);
    }
    const { accessToken, idToken, client } = connectionInfo;

    // 4. Handle Firm vs Indicative Quote
    if (args.firm) {
      // Check existing transaction for idempotency
      const existingTx: Doc<"settlementTransactions"> | null = await ctx.runQuery(
        internal.settlement_transactions.query.getByIdempotencyId,
        { idempotencyId: args.idempotencyId, projectId: args.projectId },
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
        throw mapPdaxError(err);
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
        throw mapPdaxError(err);
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

    const reserved = (await ctx.runMutation(reserveOperation, {
      projectId: args.projectId,
      provider: "pdax",
      operation: "trade",
      clientKey: args.idempotencyId,
      requestFingerprint: fingerprint({ quoteId: args.quoteId }),
      requestJson: JSON.stringify({ quoteId: args.quoteId }),
    })) as {
      operationId: Id<"providerOperations">;
      state: string;
      replay: boolean;
      providerKey: string;
      resultJson?: string;
    };
    if (reserved.state === "succeeded" && reserved.resultJson) {
      const replayData = JSON.parse(reserved.resultJson);
      return {
        ...replayData,
        state: "succeeded",
        operationId: reserved.operationId,
        replay: true,
        data: replayData,
      };
    }
    if (["submitting", "provider_pending", "reconciling"].includes(reserved.state)) {
      return { state: "in_progress", operationId: reserved.operationId, retryAfterMs: 2_000 };
    }
    if (["failed", "dead_letter"].includes(reserved.state)) {
      return { state: "recovery_required", operationId: reserved.operationId };
    }

    // 2. Fetch and validate the quote only for the first provider dispatch.
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

    const leaseToken = randomUUID();
    const claimed = (await ctx.runMutation(claimOperation, {
      operationId: reserved.operationId,
      leaseToken,
    })) as { claimed: boolean; leaseGeneration?: number };
    if (!claimed.claimed || claimed.leaseGeneration === undefined) {
      return { state: "in_progress", operationId: reserved.operationId, retryAfterMs: 2_000 };
    }

    // 3. Retrieve tokens and execute trade with the persisted provider key.
    let connectionInfo;
    try {
      connectionInfo = await getOrRefreshPdaxConnection(ctx, args.projectId);
    } catch (err) {
      throw mapPdaxError(err);
    }
    const { accessToken, idToken, client } = connectionInfo;
    let response;
    try {
      response = await client.executeTrade(accessToken, idToken, {
        quote_id: args.quoteId,
        side: quote.side as "buy" | "sell",
        idempotency_id: reserved.providerKey,
      });
    } catch (err) {
      // If quote expired on PDAX side, mark it expired locally too
      if (err instanceof PdaxError && err.status === 400) {
        await ctx.runMutation(internal.settlement_quotes.mutation.updateStatus, {
          quoteId: args.quoteId,
          status: "expired",
        });
      }
      if (ambiguousProviderError(err)) {
        await ctx.runMutation(completeOperation, {
          operationId: reserved.operationId,
          expectedState: "submitting",
          leaseToken,
          leaseGeneration: claimed.leaseGeneration,
          nextState: "reconciling",
          nextAttemptAt: Date.now() + 2_000,
          errorMessage: mapPdaxError(err).message,
        });
        return { state: "in_progress", operationId: reserved.operationId, retryAfterMs: 2_000 };
      }
      await ctx.runMutation(completeOperation, {
        operationId: reserved.operationId,
        expectedState: "submitting",
        leaseToken,
        leaseGeneration: claimed.leaseGeneration,
        nextState: "failed",
        errorMessage: mapPdaxError(err).message,
      });
      throw mapPdaxError(err);
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
      projectId: args.projectId,
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

    await ctx.runMutation(completeOperation, {
      operationId: reserved.operationId,
      expectedState: "submitting",
      leaseToken,
      leaseGeneration: claimed.leaseGeneration,
      nextState: "succeeded",
      providerReference: String(trade.order_id),
      resultJson: JSON.stringify(trade),
    });

    // Trigger Webhook
    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: args.projectId,
      eventType: "settlement.trade.executed",
      paymentIntentId: quote.paymentIntentId,
      settlementTransactionId: txDocId,
    });

    return {
      ...trade,
      state: "succeeded",
      operationId: reserved.operationId,
      replay: false,
      data: trade,
    };
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

    const reserved = (await ctx.runMutation(reserveOperation, {
      projectId: args.projectId,
      provider: "pdax",
      operation: "fiat_withdrawal",
      clientKey: args.idempotencyId,
      requestFingerprint: fingerprint({
        amount: args.amount,
        bankCode: args.bankCode,
        accountName: args.accountName,
        accountNumber: args.accountNumber,
        beneficiaryFirstName: args.beneficiaryFirstName,
        beneficiaryLastName: args.beneficiaryLastName,
        paymentIntentId: args.paymentIntentId,
      }),
      requestJson: JSON.stringify({
        amount: args.amount,
        bankCode: args.bankCode,
        accountName: args.accountName,
        accountNumber: args.accountNumber,
        beneficiaryFirstName: args.beneficiaryFirstName,
        beneficiaryLastName: args.beneficiaryLastName,
        paymentIntentId: args.paymentIntentId,
      }),
    })) as {
      operationId: Id<"providerOperations">;
      state: string;
      replay: boolean;
      providerKey: string;
      resultJson?: string;
    };
    if (reserved.state === "succeeded" && reserved.resultJson) {
      const replayData = JSON.parse(reserved.resultJson);
      return {
        ...replayData,
        state: "succeeded",
        operationId: reserved.operationId,
        replay: true,
        data: replayData,
      };
    }
    if (["submitting", "provider_pending", "reconciling"].includes(reserved.state)) {
      return { state: "in_progress", operationId: reserved.operationId, retryAfterMs: 2_000 };
    }
    if (["failed", "dead_letter"].includes(reserved.state)) {
      return { state: "recovery_required", operationId: reserved.operationId };
    }
    const leaseToken = randomUUID();
    const claimed = (await ctx.runMutation(claimOperation, {
      operationId: reserved.operationId,
      leaseToken,
    })) as { claimed: boolean; leaseGeneration?: number };
    if (!claimed.claimed || claimed.leaseGeneration === undefined) {
      return { state: "in_progress", operationId: reserved.operationId, retryAfterMs: 2_000 };
    }

    // 2. Retrieve tokens and call PDAX fiat withdrawal.
    let connectionInfo;
    try {
      connectionInfo = await getOrRefreshPdaxConnection(ctx, args.projectId);
    } catch (err) {
      throw mapPdaxError(err);
    }
    const { accessToken, idToken, client } = connectionInfo;
    let response;
    try {
      response = await client.fiatWithdraw(accessToken, idToken, {
        identifier: reserved.providerKey,
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
    } catch (err) {
      const nextState = ambiguousProviderError(err) ? "reconciling" : "failed";
      await ctx.runMutation(completeOperation, {
        operationId: reserved.operationId,
        expectedState: "submitting",
        leaseToken,
        leaseGeneration: claimed.leaseGeneration,
        nextState,
        ...(nextState === "reconciling" ? { nextAttemptAt: Date.now() + 2_000 } : {}),
        errorMessage: mapPdaxError(err).message,
      });
      if (nextState === "reconciling") {
        return { state: "in_progress", operationId: reserved.operationId, retryAfterMs: 2_000 };
      }
      throw mapPdaxError(err);
    }

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

    const resolvedRef = withdrawal.retry_methods?.[0]?.request_id || withdrawal.reference_number;
    const finalRef = cleanReferenceNumber(resolvedRef, undefined);

    await ctx.runMutation(internal.settlement_transactions.mutation.updateStatus, {
      projectId: args.projectId,
      idempotencyId: args.idempotencyId,
      status: "PAYOUT_PENDING",
      withdrawalId: withdrawal.identifier,
      withdrawalDetails: {
        referenceNumber: finalRef,
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        status: withdrawal.status,
        bankCode: args.bankCode,
        accountName: args.accountName,
        accountNumber: args.accountNumber,
      },
    });

    const result = {
      ...withdrawal,
      // Legacy top-level identifier remains the caller key; providerOperations
      // retains the persisted PDAX UUID used at the provider boundary.
      identifier: args.idempotencyId,
      reference_number: finalRef || withdrawal.reference_number,
    };
    await ctx.runMutation(completeOperation, {
      operationId: reserved.operationId,
      expectedState: "submitting",
      leaseToken,
      leaseGeneration: claimed.leaseGeneration,
      nextState: "provider_pending",
      providerReference: withdrawal.identifier,
      resultJson: JSON.stringify(result),
      nextAttemptAt: Date.now() + 2 * 60 * 1_000,
    });

    // Trigger Webhook
    await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
      projectId: args.projectId,
      eventType: "settlement.withdrawal.pending",
      paymentIntentId: args.paymentIntentId,
      settlementTransactionId: txDocId,
    });

    return {
      ...result,
      state: "in_progress",
      operationId: reserved.operationId,
      retryAfterMs: 2_000,
    };
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
    let connectionInfo;
    try {
      connectionInfo = await getOrRefreshPdaxConnection(ctx, args.projectId);
    } catch (err) {
      throw mapPdaxError(err);
    }
    const { accessToken, idToken, client } = connectionInfo;

    // 3. Fetch order status
    try {
      const response = await client.getOrder(accessToken, idToken, args.orderId);
      return response.data;
    } catch (err) {
      throw mapPdaxError(err);
    }
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
      throw new Error("No settlement or provider operation matches this PDAX identifier");
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
      const pRefRaw =
        ("request_id" in payload ? payload.request_id : "") ||
        ("reference_number" in payload ? payload.reference_number : "") ||
        ("reference_id" in payload ? payload.reference_id : "");

      const existingDetails = tx.withdrawalDetails ?? {
        referenceNumber: undefined as string | undefined,
        amount: payload.amount ?? 0,
        fee: pFee,
        bankCode: "BASECPH",
        accountName: "n/a",
        accountNumber: "n/a",
      };

      const finalRef = cleanReferenceNumber(pRefRaw, existingDetails.referenceNumber);

      await ctx.runMutation(internal.settlement_transactions.mutation.updateStatus, {
        projectId: tx.projectId,
        idempotencyId: tx.idempotencyId,
        status: newStatus,
        withdrawalId: identifier,
        withdrawalDetails: {
          referenceNumber: finalRef,
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

export const registerWebhook = action({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate project owner
    const project = await ctx.runQuery(api.projects.query.getById, { id: args.projectId });
    if (!project) {
      throw new Error("Unauthorized or project not found");
    }

    // 2. Retrieve connection tokens and client
    let connectionInfo;
    try {
      connectionInfo = await getOrRefreshPdaxConnection(ctx, args.projectId);
    } catch (err) {
      throw mapPdaxError(err);
    }
    const { accessToken, idToken, client } = connectionInfo;

    const callbackBase = process.env.PDAX_CALLBACK_URL?.replace(/\/$/, "");
    const callbackToken = process.env.PDAX_WEBHOOK_TOKEN;
    if (!callbackBase || !callbackToken) {
      throw new Error("PDAX callback URL and webhook token are not configured");
    }
    const webhookUrl = `${callbackBase}/api/webhooks/pdax/v1?token=${encodeURIComponent(callbackToken)}`;

    // 3. Call PDAX to register the webhook URL for both 'crypto' and 'fiat'
    try {
      await client.registerWebhook(accessToken, idToken, webhookUrl, "crypto");
      await client.registerWebhook(accessToken, idToken, webhookUrl, "fiat");
      return { status: "success" };
    } catch (err) {
      throw mapPdaxError(err);
    }
  },
});

export const checkPayoutStatus = action({
  args: {
    projectId: v.id("projects"),
    idempotencyId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    // 1. Authenticate project owner
    const project = await ctx.runQuery(api.projects.query.getById, { id: args.projectId });
    if (!project) {
      throw new Error("Unauthorized or project not found");
    }

    // 2. Get pending transactions to check
    let pendingTxs: Array<{
      _id: Id<"settlementTransactions">;
      idempotencyId: string;
      withdrawalId?: string;
      projectId: Id<"projects">;
      paymentIntentId?: Id<"paymentIntents">;
      withdrawalDetails?: {
        referenceNumber?: string;
        amount: number;
        fee: number;
        status: string;
        bankCode: string;
        accountName: string;
        accountNumber: string;
      };
    }> = [];

    if (args.idempotencyId) {
      const tx = await ctx.runQuery(internal.settlement_transactions.query.getByIdempotencyId, {
        idempotencyId: args.idempotencyId,
        projectId: args.projectId,
      });
      if (tx && tx.status === "PAYOUT_PENDING") {
        pendingTxs = [tx];
      }
    } else {
      const allPending = await ctx.runQuery(
        internal.settlement_transactions.query.listAllPending,
        {},
      );
      pendingTxs = allPending.filter(
        (tx: { projectId: Id<"projects"> }) => tx.projectId === args.projectId,
      );
    }

    if (pendingTxs.length === 0) {
      return { updated: 0, message: "No pending payouts to check" };
    }

    // 3. Get PDAX connection
    let connectionInfo;
    try {
      connectionInfo = await getOrRefreshPdaxConnection(ctx, args.projectId);
    } catch (err) {
      throw mapPdaxError(err);
    }
    const { accessToken, idToken, client } = connectionInfo;

    let updated = 0;

    // 4. Poll PDAX for each pending transaction
    for (const tx of pendingTxs) {
      const identifier = tx.withdrawalId || tx.idempotencyId;
      try {
        const response = await client.getFiatTransactions(accessToken, idToken, {
          identifier,
          mode: "CashOut",
          page: 1,
          pageSize: 1,
        });

        const pdaxTx = response.data?.[0];
        if (!pdaxTx) continue;

        const upperStatus = String(pdaxTx.status || "").toUpperCase();
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
          // Still pending, skip update
          continue;
        }

        const existingDetails = tx.withdrawalDetails ?? {
          referenceNumber: undefined as string | undefined,
          amount: parseFloat(pdaxTx.amount) || 0,
          fee: parseFloat(pdaxTx.fee || "0") || 0,
          bankCode: "BASECPH",
          accountName: "n/a",
          accountNumber: "n/a",
        };

        const resolvedRef =
          pdaxTx.request_id || pdaxTx.retried_methods?.[0]?.request_id || pdaxTx.reference_number;
        const finalRef = cleanReferenceNumber(resolvedRef, existingDetails.referenceNumber);

        await ctx.runMutation(internal.settlement_transactions.mutation.updateStatus, {
          projectId: tx.projectId,
          idempotencyId: tx.idempotencyId,
          status: newStatus,
          withdrawalId: identifier,
          withdrawalDetails: {
            referenceNumber: finalRef,
            amount: parseFloat(pdaxTx.amount) || existingDetails.amount,
            fee: parseFloat(pdaxTx.fee || "0") || existingDetails.fee,
            status: pdaxTx.status,
            bankCode: existingDetails.bankCode,
            accountName: existingDetails.accountName,
            accountNumber: existingDetails.accountNumber,
          },
        });

        // Dispatch merchant webhook
        await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
          projectId: tx.projectId,
          eventType: webhookType,
          paymentIntentId: tx.paymentIntentId,
          settlementTransactionId: tx._id,
        });

        updated++;
      } catch (err) {
        console.error(`Failed to poll PDAX for withdrawal ${identifier}:`, err);
        // Continue with next transaction, don't fail the whole batch
      }
    }

    return { updated, total: pendingTxs.length };
  },
});

export const pollPendingPayouts = internalAction({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    // 1. Get all pending payout transactions
    const pendingTxs = await ctx.runQuery(
      internal.settlement_transactions.query.listAllPending,
      {},
    );

    if (pendingTxs.length === 0) {
      return { updated: 0, message: "No pending payouts" };
    }

    // 2. Group by projectId
    const byProject = new Map<string, typeof pendingTxs>();
    for (const tx of pendingTxs) {
      const key = tx.projectId;
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(tx);
    }

    let totalUpdated = 0;

    // 3. Poll PDAX for each project's pending transactions
    for (const [projectId, txs] of byProject) {
      try {
        const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(
          ctx,
          projectId as Id<"projects">,
        );

        for (const tx of txs) {
          const identifier = tx.withdrawalId || tx.idempotencyId;
          try {
            const response = await client.getFiatTransactions(accessToken, idToken, {
              identifier,
              mode: "CashOut",
              page: 1,
              pageSize: 1,
            });

            const pdaxTx = response.data?.[0];
            if (!pdaxTx) continue;

            const upperStatus = String(pdaxTx.status || "").toUpperCase();
            let newStatus: "PAYOUT_SUCCEEDED" | "PAYOUT_FAILED" | "PAYOUT_PENDING" =
              "PAYOUT_PENDING";
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
              continue;
            }

            const existingDetails = tx.withdrawalDetails ?? {
              referenceNumber: undefined as string | undefined,
              amount: parseFloat(pdaxTx.amount) || 0,
              fee: parseFloat(pdaxTx.fee || "0") || 0,
              bankCode: "BASECPH",
              accountName: "n/a",
              accountNumber: "n/a",
            };

            const resolvedRef =
              pdaxTx.request_id ||
              pdaxTx.retried_methods?.[0]?.request_id ||
              pdaxTx.reference_number;
            const finalRef = cleanReferenceNumber(resolvedRef, existingDetails.referenceNumber);

            await ctx.runMutation(internal.settlement_transactions.mutation.updateStatus, {
              projectId: tx.projectId,
              idempotencyId: tx.idempotencyId,
              status: newStatus,
              withdrawalId: identifier,
              withdrawalDetails: {
                referenceNumber: finalRef,
                amount: parseFloat(pdaxTx.amount) || existingDetails.amount,
                fee: parseFloat(pdaxTx.fee || "0") || existingDetails.fee,
                status: pdaxTx.status,
                bankCode: existingDetails.bankCode,
                accountName: existingDetails.accountName,
                accountNumber: existingDetails.accountNumber,
              },
            });

            await ctx.scheduler.runAfter(0, internal.webhookDelivery.trigger, {
              projectId: tx.projectId,
              eventType: webhookType,
              paymentIntentId: tx.paymentIntentId,
              settlementTransactionId: tx._id,
            });

            totalUpdated++;
          } catch (err) {
            console.error(`Failed to poll PDAX for withdrawal ${identifier}:`, err);
          }
        }
      } catch (err) {
        console.error(`Failed to get PDAX connection for project ${projectId}:`, err);
      }
    }

    return { updated: totalUpdated, total: pendingTxs.length };
  },
});
