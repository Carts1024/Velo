import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  type rpc,
} from "@stellar/stellar-sdk";

import { lookupTestnetTransaction, parseTransactionResponse } from "./transaction-debugger.ts";

test("RPC dependency request carries correlation and trace headers", async () => {
  let requestHeaders = new Headers();
  const server = createServer((request, response) => {
    requestHeaders = new Headers(request.headers as Record<string, string>);
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const rpcRequest = JSON.parse(body) as { id: string | number };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: rpcRequest.id,
          result: { status: "NOT_FOUND", latestLedger: 10, oldestLedger: 1 },
        }),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test_server_unavailable");
  try {
    const result = await lookupTestnetTransaction(
      `http://127.0.0.1:${address.port}`,
      "a".repeat(64),
      {
        allowHttp: true,
        telemetryContext: {
          requestCorrelationId: "request-00000001",
          journeyCorrelationId: "journey-00000001",
          traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        },
      },
    );
    assert.equal(result.status, "not_found");
    assert.equal(requestHeaders.get("x-correlation-id"), "request-00000001");
    assert.equal(requestHeaders.get("x-velo-journey-id"), "journey-00000001");
    assert.equal(
      requestHeaders.get("traceparent"),
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("transaction debugger exposes settlement-relevant payment fields", () => {
  const source = Keypair.random().publicKey();
  const destination = Keypair.random().publicKey();
  const issuer = Keypair.random().publicKey();
  const hash = "a".repeat(64);
  const transaction = new TransactionBuilder(new Account(source, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: new Asset("USDC", issuer),
        amount: "12.5",
      }),
    )
    .setTimeout(30)
    .build();

  const response = {
    status: "SUCCESS",
    txHash: hash,
    latestLedger: 10,
    oldestLedger: 1,
    ledger: 9,
    createdAt: 1_700_000_000,
    feeBump: false,
    envelopeXdr: transaction.toEnvelope(),
    resultXdr: {
      toXDR: () => Buffer.from("result"),
      result: () => ({ switch: () => ({ name: "txSuccess" }) }),
      feeCharged: () => 100n,
    },
    resultMetaXdr: { toXDR: () => Buffer.from("meta") },
    events: { contractEventsXdr: [] },
  } as unknown as rpc.Api.GetSuccessfulTransactionResponse;

  const result = parseTransactionResponse(hash, response);

  assert.equal(result.status, "success");
  assert.deepEqual(result.operations, [
    {
      index: 0,
      type: "payment",
      source,
      destination,
      amount: "12.5000000",
      asset: `USDC:${issuer}`,
    },
  ]);
});
