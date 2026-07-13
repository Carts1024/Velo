/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function asWallet(t: ReturnType<typeof convexTest>, ownerAddress: string) {
  return t.withIdentity({
    subject: ownerAddress,
    issuer: "http://localhost:3000",
    tokenIdentifier: `http://localhost:3000|${ownerAddress}`,
  });
}

test("settlement provider foundation lifecycle", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const owner = asWallet(t, ownerAddress);

  // 1. Create a project
  const projectId = await owner.mutation(api.projects.mutation.createDraft, {
    name: "Stellar Merchant",
    slug: "stellar-merchant",
    description: "Accepting stablecoins on Stellar",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  // 2. Test provider connections
  // Upsert connection tokens internally (like from an action)
  const connectionId = await t.mutation(internal.provider_connections.mutation.upsertInternal, {
    projectId,
    provider: "pdax",
    status: "connected",
    username: "merchant@test.com",
    accessToken: "secret-access-token",
    idToken: "secret-id-token",
    refreshToken: "secret-refresh-token",
    tokenExpiresAt: Date.now() + 600000,
  });
  expect(connectionId).toBeDefined();

  // Query internally (should return tokens)
  const internalConn = await t.query(internal.provider_connections.query.getInternal, {
    projectId,
    provider: "pdax",
  });
  expect(internalConn?.accessToken).toBe("secret-access-token");
  expect(internalConn?.refreshToken).toBe("secret-refresh-token");

  // Query publicly (should STRIP tokens)
  const publicConn = await owner.query(api.provider_connections.query.getByProject, {
    projectId,
  });
  expect(publicConn).toBeDefined();
  expect(publicConn?.status).toBe("connected");
  expect(publicConn?.username).toBe("merchant@test.com");
  const connRecord = publicConn as unknown as Record<string, unknown>;
  expect(connRecord.accessToken).toBeUndefined();
  expect(connRecord.idToken).toBeUndefined();
  expect(connRecord.refreshToken).toBeUndefined();

  // 3. Test settlement quotes
  const quoteId = "018fa0b8-b6e0-70e7-ad7e-1a9803695a86";
  const expiresAt = Date.now() + 15000;
  await t.mutation(internal.settlement_quotes.mutation.create, {
    projectId,
    provider: "pdax",
    quoteId,
    side: "buy",
    quoteCurrency: "USDCXLM",
    baseCurrency: "PHP",
    quantity: "1000",
    price: 58.2,
    totalAmount: 58200,
    expiresAt,
    status: "active",
  });

  // Query quote list publicly
  const quotesList = await owner.query(api.settlement_quotes.query.listByProject, {
    projectId,
  });
  expect(quotesList.length).toBe(1);
  expect(quotesList[0].quoteId).toBe(quoteId);
  expect(quotesList[0].status).toBe("active");

  // Update status internally
  await t.mutation(internal.settlement_quotes.mutation.updateStatus, {
    quoteId,
    status: "executed",
  });

  // Check it is updated
  const updatedQuote = await t.query(internal.settlement_quotes.query.getByQuoteId, {
    quoteId,
  });
  expect(updatedQuote?.status).toBe("executed");

  // 4. Test settlement transactions
  const idempotencyId = "417699ae-c57a-4304-bf44-b75faf5a4d7f";
  const txnId = await t.mutation(internal.settlement_transactions.mutation.create, {
    projectId,
    provider: "pdax",
    status: "QUOTE_FIRM",
    idempotencyId,
    quoteId,
  });
  expect(txnId).toBeDefined();

  // Retrieve list
  const txnsList = await owner.query(api.settlement_transactions.query.listByProject, {
    projectId,
  });
  expect(txnsList.length).toBe(1);
  expect(txnsList[0].status).toBe("QUOTE_FIRM");

  // Update state (e.g. trade executed)
  const orderId = 122121;
  await t.mutation(internal.settlement_transactions.mutation.updateStatus, {
    idempotencyId,
    status: "TRADE_EXECUTED",
    orderId,
    tradeDetails: {
      orderId,
      price: 58.2,
      amount: 1000,
      quantity: 17.18,
      status: "successful",
    },
  });

  // Fetch by order id
  const txnByOrder = await t.query(internal.settlement_transactions.query.getByOrderId, {
    orderId,
  });
  expect(txnByOrder?.status).toBe("TRADE_EXECUTED");
  expect(txnByOrder?.tradeDetails?.price).toBe(58.2);

  // Update state (e.g. withdrawal pending)
  const withdrawalId = "tx_velo_settlement_001";
  await t.mutation(internal.settlement_transactions.mutation.updateStatus, {
    idempotencyId,
    status: "PAYOUT_PENDING",
    withdrawalId,
    withdrawalDetails: {
      referenceNumber: "ref-12345",
      amount: 1000,
      fee: 15,
      status: "PENDING",
      bankCode: "BASECPH",
      accountName: "John Doe",
      accountNumber: "0000042001461",
    },
  });

  // Fetch by withdrawal id
  const txnByWithdrawal = await t.query(internal.settlement_transactions.query.getByWithdrawalId, {
    withdrawalId,
  });
  expect(txnByWithdrawal?.status).toBe("PAYOUT_PENDING");
  expect(txnByWithdrawal?.withdrawalDetails?.bankCode).toBe("BASECPH");

  // 5. Test provider events
  const eventId = "ref-12345";
  const eventRes = await t.mutation(internal.provider_events.mutation.recordEvent, {
    projectId,
    provider: "pdax",
    eventId,
    type: "WITHDRAWAL",
    rawEvent: '{"status":"COMPLETED"}',
    processed: false,
  });
  expect(eventRes.alreadyRecorded).toBe(false);

  // Try duplicate event
  const duplicateRes = await t.mutation(internal.provider_events.mutation.recordEvent, {
    projectId,
    provider: "pdax",
    eventId,
    type: "WITHDRAWAL",
    rawEvent: '{"status":"COMPLETED"}',
    processed: false,
  });
  expect(duplicateRes.alreadyRecorded).toBe(true);

  // Fetch event internally
  const event = await t.query(internal.provider_events.mutation.getByEventId, {
    eventId,
  });
  expect(event?.processed).toBe(false);

  // Mark processed
  await t.mutation(internal.provider_events.mutation.markProcessed, {
    eventId,
  });
  const processedEvent = await t.query(internal.provider_events.mutation.getByEventId, {
    eventId,
  });
  expect(processedEvent?.processed).toBe(true);

  // Disconnect provider Connection
  const disconnected = await owner.mutation(api.provider_connections.mutation.disconnect, {
    projectId,
  });
  expect(disconnected).toBe(true);

  const finalPublicConn = await owner.query(api.provider_connections.query.getByProject, {
    projectId,
  });
  expect(finalPublicConn?.status).toBe("disconnected");
});

test("settlement actions workflow integration", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const owner = asWallet(t, ownerAddress);

  // Set UAT credentials in env
  process.env.PDAX_UAT_USERNAME = "merchant@test.com";
  process.env.PDAX_UAT_PASSWORD = "password123";
  process.env.PDAX_UAT_BASE_URL = "https://uat.services.sandbox.pdax.ph/api/pdax-api";

  // Create project
  const projectId = await owner.mutation(api.projects.mutation.createDraft, {
    name: "Merchant Actions Store",
    slug: "merchant-actions-store",
    description: "Testing settlement actions",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  const originalFetch = globalThis.fetch;

  // Mock fetch responses
  globalThis.fetch = async (input, init) => {
    const url = input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : null;

    if (url.includes("/pdax-institution/v1/login")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          email: "merchant@test.com",
          username: "merchant-username",
          groups: ["exchange_user"],
          token_type: "Bearer",
          preferred_mfa: "SOFTWARE_TOKEN_MFA",
          expiry: 600,
          access_token: "mock-access-token",
          id_token: "mock-id-token",
          refresh_token: "mock-refresh-token",
        }),
      } as Response;
    }

    if (url.includes("/pdax-institution/v1/balances")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          data: [
            {
              currency: "USDCXLM",
              available: "5000",
              hold: "0",
              total: "5000",
              asset_type: "CRYPTO",
            },
            {
              currency: "PHP",
              available: "10000",
              hold: "0",
              total: "10000",
              asset_type: "FIAT",
            },
          ],
        }),
      } as Response;
    }

    if (url.includes("/pdax-institution/v2/trade/quote")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          data: {
            quote_id: "quote-12345",
            expires_at: new Date(Date.now() + 15000).toISOString(),
            quote_currency: body.quote_currency,
            base_currency: body.base_currency,
            side: body.side,
            base_quantity: body.quantity,
            price: 58.2,
            total_amount: body.quantity * 58.2,
          },
        }),
      } as Response;
    }

    if (url.includes("/pdax-institution/v1/trade")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          data: {
            order_id: 98765,
            status: "successful",
            quote_currency: "USDCXLM",
            base_currency: "PHP",
            side: "sell",
            base_quantity: 10,
            price: 58.2,
            total_amount: 582,
            created_at: new Date().toISOString(),
          },
        }),
      } as Response;
    }

    if (url.includes("/pdax-institution/v1/fiat/withdraw")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          data: {
            identifier: body.identifier,
            reference_number: "ref-withdraw-123",
            amount: Number(body.amount),
            method: "PAY-TO-ACCOUNT-REAL-TIME",
            status: "PENDING",
            fee: 15,
          },
        }),
      } as Response;
    }

    if (url.includes("/pdax-institution/v1/orders/98765")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          data: {
            order_id: 98765,
            status: "SUCCESSFUL",
            quote_currency: "USDCXLM",
            base_currency: "PHP",
            side: "sell",
            base_quantity: 10,
            price: 58.2,
            total_amount: 582,
            created_at: new Date().toISOString(),
          },
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    // 1. Connect
    const connectRes = await owner.action(api.settlement.actions.connect, { projectId });
    expect(connectRes.status).toBe("connected");

    // Verify token is cached
    const conn = await t.query(internal.provider_connections.query.getInternal, {
      projectId,
      provider: "pdax",
    });
    expect(conn?.status).toBe("connected");
    expect(conn?.accessToken).toBe("mock-access-token");

    // 2. Balances
    const balances = (await owner.action(api.settlement.actions.getBalances, {
      projectId,
    })) as { currency: string; available: string }[];
    expect(balances.length).toBe(2);
    expect(balances[0].currency).toBe("USDCXLM");
    expect(balances[0].available).toBe("5000");

    // 3. Firm Quote
    const { quote, transactionId } = (await owner.action(api.settlement.actions.getQuote, {
      projectId,
      side: "sell",
      quoteCurrency: "USDCXLM",
      baseCurrency: "PHP",
      quantity: 10,
      currency: "USDCXLM",
      firm: true,
      idempotencyId: "quote-idemp-1",
    })) as { quote: { quote_id: string; price: number }; transactionId: string };

    expect(quote.quote_id).toBe("quote-12345");
    expect(quote.price).toBe(58.2);
    expect(transactionId).toBeDefined();

    // Verify stored Quote
    const storedQuote = await t.query(internal.settlement_quotes.query.getByQuoteId, {
      quoteId: "quote-12345",
    });
    expect(storedQuote?.status).toBe("active");
    expect(storedQuote?.price).toBe(58.2);

    // Verify stored Transaction
    let storedTx = await t.query(internal.settlement_transactions.query.getByIdempotencyId, {
      idempotencyId: "quote-idemp-1",
    });
    expect(storedTx?.status).toBe("QUOTE_FIRM");
    expect(storedTx?.quoteId).toBe("quote-12345");

    // 4. Trade Execution
    const trade = (await owner.action(api.settlement.actions.executeTrade, {
      projectId,
      quoteId: "quote-12345",
      idempotencyId: "trade-idemp-1",
    })) as { order_id: number; status: string };
    expect(trade.order_id).toBe(98765);
    expect(trade.status).toBe("successful");

    // Verify updated Quote and Transaction
    const updatedQuote = await t.query(internal.settlement_quotes.query.getByQuoteId, {
      quoteId: "quote-12345",
    });
    expect(updatedQuote?.status).toBe("executed");

    storedTx = await t.query(internal.settlement_transactions.query.getByIdempotencyId, {
      idempotencyId: "trade-idemp-1",
    });
    expect(storedTx?.status).toBe("TRADE_EXECUTED");
    expect(storedTx?.tradeDetails?.orderId).toBe(98765);

    // 5. Fiat Withdrawal
    const withdrawal = (await owner.action(api.settlement.actions.fiatWithdraw, {
      projectId,
      idempotencyId: "withdraw-idemp-1",
      amount: 500,
      bankCode: "BASECPH",
      accountName: "John Doe",
      accountNumber: "123456",
      beneficiaryFirstName: "John",
      beneficiaryLastName: "Doe",
    })) as { identifier: string; reference_number: string; status: string };
    expect(withdrawal.identifier).toBe("withdraw-idemp-1");
    expect(withdrawal.reference_number).toBe("ref-withdraw-123");
    expect(withdrawal.status).toBe("PENDING");

    storedTx = await t.query(internal.settlement_transactions.query.getByIdempotencyId, {
      idempotencyId: "withdraw-idemp-1",
    });
    expect(storedTx?.status).toBe("PAYOUT_PENDING");
    expect(storedTx?.withdrawalDetails?.referenceNumber).toBe("ref-withdraw-123");

    // 6. Get Order Details
    const orderDetails = (await owner.action(api.settlement.actions.getOrder, {
      projectId,
      orderId: 98765,
    })) as { order_id: number; status: string };
    expect(orderDetails.order_id).toBe(98765);
    expect(orderDetails.status).toBe("SUCCESSFUL");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.PDAX_UAT_USERNAME;
    delete process.env.PDAX_UAT_PASSWORD;
    delete process.env.PDAX_UAT_BASE_URL;
  }
});

test("settlement webhook processing and helper queries", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const owner = asWallet(t, ownerAddress);

  // 1. Create project
  const projectId = await owner.mutation(api.projects.mutation.createDraft, {
    name: "Stellar Webhooks project",
    slug: "stellar-webhooks-project",
    description: "Testing webhooks",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  // 2. Create connection
  await t.mutation(internal.provider_connections.mutation.upsertInternal, {
    projectId,
    provider: "pdax",
    status: "connected",
    username: "merchant-username",
    accessToken: "access",
    idToken: "id",
    refreshToken: "refresh",
    tokenExpiresAt: Date.now() + 600000,
  });

  // 3. Create a quote and settlement transaction
  const quoteId = "quote-doc-123";
  const quoteDocId = await t.mutation(internal.settlement_quotes.mutation.create, {
    projectId,
    provider: "pdax",
    quoteId,
    side: "sell",
    quoteCurrency: "USDCXLM",
    baseCurrency: "PHP",
    quantity: "10",
    price: 58.2,
    totalAmount: 582,
    expiresAt: Date.now() + 15000,
    status: "active",
  });

  const idempotencyId = "tx-idemp-123";
  const txDocId = await t.mutation(internal.settlement_transactions.mutation.create, {
    projectId,
    provider: "pdax",
    status: "QUOTE_FIRM",
    idempotencyId,
    quoteId,
  });

  // Test getById helpers
  const fetchedQuote = await t.query(internal.settlement_quotes.query.getById, { id: quoteDocId });
  expect(fetchedQuote?.quoteId).toBe(quoteId);

  const fetchedTx = await t.query(internal.settlement_transactions.query.getById, { id: txDocId });
  expect(fetchedTx?.idempotencyId).toBe(idempotencyId);

  // Test getByAnyIdentifier helper
  const matchedTx1 = await t.query(internal.settlement_transactions.query.getByAnyIdentifier, {
    identifier: idempotencyId,
  });
  expect(matchedTx1?._id).toBe(txDocId);

  // 4. Update transaction to pending withdrawal
  await t.mutation(internal.settlement_transactions.mutation.updateStatus, {
    idempotencyId,
    status: "PAYOUT_PENDING",
    withdrawalId: "withdraw-identifier-123",
    withdrawalDetails: {
      referenceNumber: "ref-9999",
      amount: 582,
      fee: 15,
      status: "PENDING",
      bankCode: "BASECPH",
      accountName: "John Doe",
      accountNumber: "0000042001461",
    },
  });

  const matchedTx2 = await t.query(internal.settlement_transactions.query.getByAnyIdentifier, {
    identifier: "withdraw-identifier-123",
  });
  expect(matchedTx2?._id).toBe(txDocId);

  // 5. Test handlePdaxWebhook action for WITHDRAWAL success callback
  const mockWebhookPayload = {
    identifier: "withdraw-identifier-123",
    user_id: "merchant-username",
    request_id: "req-uuid-123",
    reference_number: "ref-9999",
    amount: 582,
    asset: "PHP",
    asset_type: "FIAT",
    transaction_type: "WITHDRAWAL",
    status: "COMPLETED",
    method: "PAY-TO-ACCOUNT-REAL-TIME",
    fee: 15,
  };

  const processRes = (await t.action(api.settlement.actions.handlePdaxWebhook, {
    payload: mockWebhookPayload,
  })) as Record<string, unknown>;

  expect(processRes.status).toBe("processed");
  expect(processRes.eventId).toBe("req-uuid-123");

  // Verify transaction status updated in DB
  const updatedTx = await t.query(internal.settlement_transactions.query.getById, { id: txDocId });
  expect(updatedTx?.status).toBe("PAYOUT_SUCCEEDED");
  expect(updatedTx?.withdrawalDetails?.status).toBe("COMPLETED");

  // Verify provider event was recorded and marked processed
  const pEvent = await t.query(internal.provider_events.mutation.getByEventId, {
    eventId: "req-uuid-123",
  });
  expect(pEvent).toBeDefined();
  expect(pEvent?.processed).toBe(true);

  // 6. Test duplicate webhook payload protection
  const dupRes = (await t.action(api.settlement.actions.handlePdaxWebhook, {
    payload: mockWebhookPayload,
  })) as Record<string, unknown>;
  expect(dupRes.status).toBe("duplicate");

  // 7. Unmatched callbacks fail closed; there is no "first project" fallback.
  const depositPayload = {
    identifier: "dep-identifier-456",
    user_id: "merchant-username",
    reference_id: "ref-dep-456",
    request_id: "req-uuid-456",
    transaction_type: "DEPOSIT",
    transaction_hash: "hash-hash-hash",
    amount: 100,
    fee_amount: 0,
    asset_type: "crypto",
    asset: "USDCXLM",
    network: "XLM_USDC_T_CEKS",
    source_address: "GA54SPC34JL3I57ENALTO2V26XOFFG4VGQLFQXDGF6KJ5TJY7ODY56ST",
    destination_address: "GDC326O65O223UFTB6Z6YV6SP7DOKHGL3Q74Z3J6V3AOS5W5YST6SGA5",
    status: "completed",
  };

  await expect(
    t.action(api.settlement.actions.handlePdaxWebhook, { payload: depositPayload }),
  ).rejects.toThrow(/No settlement or provider operation matches/);

  const depositEvent = await t.query(internal.provider_events.mutation.getByEventId, {
    eventId: "req-uuid-456",
  });
  expect(depositEvent).toBeNull();
});
