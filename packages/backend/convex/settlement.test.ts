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
