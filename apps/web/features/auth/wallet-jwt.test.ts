import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_CONVEX_URL ??= "https://dummy.convex.cloud";

const { Keypair, Transaction, Networks } = await import("@repo/stellar");
const { createWalletChallenge, verifyWalletChallenge } =
  await import("../../core/auth/wallet-jwt.ts");

test("SEP-10 Challenge Lifecycle", () => {
  const clientKP = Keypair.random();
  const address = clientKP.publicKey();

  // 1. Create a challenge
  const { challenge } = createWalletChallenge(address);
  assert.ok(challenge, "Challenge transaction should be generated");

  // 2. Client signs the challenge transaction
  const tx = new Transaction(challenge, Networks.TESTNET);
  tx.sign(clientKP);
  const signedTxXdr = tx.toEnvelope().toXDR("base64");

  // 3. Verify the signed challenge
  const verifiedAddress = verifyWalletChallenge({
    address,
    challenge: signedTxXdr,
  });

  assert.equal(verifiedAddress, address, "Verified address should match client address");
});
