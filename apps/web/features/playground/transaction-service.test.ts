import assert from "node:assert/strict";
import test from "node:test";

import {
  Account,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import {
  assertHelloSymbol,
  parseHelloTransactionReview,
  simulateHello,
  verifySignedTransaction,
} from "./server/transaction-service.ts";

const sourceKeypair = Keypair.random();
const source = sourceKeypair.publicKey();
const contractId = StrKey.encodeContract(Keypair.random().rawPublicKey());
const fixture = {
  network: "testnet" as const,
  contractId,
  wasmHash: "ab".repeat(32),
  functionName: "hello" as const,
};

function transaction(argument = "Velo") {
  return new TransactionBuilder(new Account(source, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(contractId).call("hello", nativeToScVal(argument, { type: "symbol" })),
    )
    .setTimeout(300)
    .build();
}

function customTransaction({
  sourceAccount = source,
  sequence = "1",
  fee = "100",
  maxTime = 300,
  targetContract = contractId,
  functionName = "hello",
  operations = 1,
  networkPassphrase = Networks.TESTNET,
}: {
  sourceAccount?: string;
  sequence?: string;
  fee?: string;
  maxTime?: number;
  targetContract?: string;
  functionName?: string;
  operations?: number;
  networkPassphrase?: string;
} = {}) {
  const builder = new TransactionBuilder(new Account(sourceAccount, sequence), {
    fee,
    networkPassphrase,
  });
  for (let index = 0; index < operations; index += 1) {
    builder.addOperation(
      new Contract(targetContract).call(functionName, nativeToScVal("Velo", { type: "symbol" })),
    );
  }
  return builder.setTimeout(maxTime).build();
}

test("validates canonical Soroban Symbol arguments", () => {
  assert.equal(assertHelloSymbol("Velo_2026"), "Velo_2026");
  assert.throws(() => assertHelloSymbol(""));
  assert.throws(() => assertHelloSymbol("not allowed"));
  assert.throws(() => assertHelloSymbol("x".repeat(33)));
});

test("derives every review field from the exact unsigned XDR", () => {
  const tx = transaction();
  const review = parseHelloTransactionReview(tx, fixture);
  assert.equal(review.network, "testnet");
  assert.equal(review.sourceAccount, source);
  assert.equal(review.contractId, contractId);
  assert.equal(review.functionName, "hello");
  assert.deepEqual(review.arguments, [{ name: "to", type: "symbol", value: "Velo" }]);
  assert.equal(review.transactionHash, tx.hash().toString("hex"));
  assert.equal(review.totalFee, tx.fee);
});

test("signed envelope verification rejects a different reviewed transaction hash", () => {
  const tx = transaction();
  tx.sign(sourceKeypair);
  assert.doesNotThrow(() =>
    verifySignedTransaction(tx.toXDR(), tx.hash().toString("hex"), fixture),
  );
  assert.throws(() => verifySignedTransaction(tx.toXDR(), "00".repeat(32), fixture));
});

test("rejects a signature that does not belong to the source account", () => {
  const tx = transaction();
  tx.sign(Keypair.random());
  assert.throws(() => verifySignedTransaction(tx.toXDR(), tx.hash().toString("hex"), fixture));
});

test("operation or argument mutation changes the reviewed hash", () => {
  const original = transaction("Velo");
  const changed = transaction("Other");
  assert.notEqual(original.hash().toString("hex"), changed.hash().toString("hex"));
  assert.throws(() =>
    verifySignedTransaction(changed.toXDR(), original.hash().toString("hex"), fixture),
  );
});

test("rejects wrong contract, function, and operation count", () => {
  const otherContract = StrKey.encodeContract(Keypair.random().rawPublicKey());
  assert.throws(() =>
    parseHelloTransactionReview(customTransaction({ targetContract: otherContract }), fixture),
  );
  assert.throws(() =>
    parseHelloTransactionReview(customTransaction({ functionName: "other" }), fixture),
  );
  assert.throws(() => parseHelloTransactionReview(customTransaction({ operations: 2 }), fixture));
});

test("source, sequence, fee, and time-bound mutations alter the exact hash", () => {
  const baseline = customTransaction();
  const baselineHash = baseline.hash().toString("hex");
  const variants = [
    customTransaction({ sourceAccount: Keypair.random().publicKey() }),
    customTransaction({ sequence: "2" }),
    customTransaction({ fee: "200" }),
    customTransaction({ maxTime: 120 }),
  ];
  for (const variant of variants) {
    variant.sign(Keypair.random());
    assert.notEqual(variant.hash().toString("hex"), baselineHash);
    assert.throws(() => verifySignedTransaction(variant.toXDR(), baselineHash, fixture));
  }
});

test("Mainnet simulation is rejected before fixture or RPC work", async () => {
  await assert.rejects(
    simulateHello(
      {
        network: "mainnet",
        contractId,
        sourceAccount: source,
        argument: "Velo",
      },
      "corr-mainnet",
    ),
    /Testnet only/,
  );
});
