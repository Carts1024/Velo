import assert from "node:assert/strict";
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

import { parseTransactionResponse } from "./transaction-debugger.ts";

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
