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
  assertWalletEnvelopeMatchesReview,
  transactionHashFromTestnetXdr,
} from "./client-integrity.ts";

function envelope(argument: string) {
  const source = Keypair.random();
  const contractId = StrKey.encodeContract(Keypair.random().rawPublicKey());
  const transaction = new TransactionBuilder(new Account(source.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(contractId).call("hello", nativeToScVal(argument, { type: "symbol" })),
    )
    .setTimeout(300)
    .build();
  return { source, transaction };
}

test("wallet signature preserves the exact reviewed transaction hash", () => {
  const { source, transaction } = envelope("Velo");
  const unsignedXdr = transaction.toXDR();
  const reviewedHash = transactionHashFromTestnetXdr(unsignedXdr);
  transaction.sign(source);
  assert.doesNotThrow(() =>
    assertWalletEnvelopeMatchesReview(unsignedXdr, transaction.toXDR(), reviewedHash),
  );
});

test("client integrity boundary rejects a changed signed envelope", () => {
  const original = envelope("Velo").transaction;
  const changed = envelope("Other");
  changed.transaction.sign(changed.source);
  assert.throws(() =>
    assertWalletEnvelopeMatchesReview(
      original.toXDR(),
      changed.transaction.toXDR(),
      transactionHashFromTestnetXdr(original.toXDR()),
    ),
  );
});
