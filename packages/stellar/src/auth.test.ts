import assert from "node:assert/strict";
import test from "node:test";

import { hash, Keypair } from "@stellar/stellar-sdk";

import { verifySignedMessage } from "./auth.ts";

const keypair = Keypair.random();
const message = "Sign in to Velo\nNonce: test";
const signature = keypair.sign(Buffer.from(message, "utf8"));

test("verifySignedMessage accepts base64 signatures", () => {
  assert.equal(
    verifySignedMessage({
      publicKey: keypair.publicKey(),
      message,
      signature: signature.toString("base64"),
    }),
    true,
  );
});

test("verifySignedMessage accepts base64url signatures", () => {
  assert.equal(
    verifySignedMessage({
      publicKey: keypair.publicKey(),
      message,
      signature: signature
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_"),
    }),
    true,
  );
});

test("verifySignedMessage accepts hex signatures", () => {
  assert.equal(
    verifySignedMessage({
      publicKey: keypair.publicKey(),
      message,
      signature: signature.toString("hex"),
    }),
    true,
  );
});

test("verifySignedMessage accepts decorated signature XDR", () => {
  assert.equal(
    verifySignedMessage({
      publicKey: keypair.publicKey(),
      message,
      signature: keypair.signDecorated(Buffer.from(message, "utf8")).toXDR("base64"),
    }),
    true,
  );
});

test("verifySignedMessage accepts signatures over message hashes", () => {
  assert.equal(
    verifySignedMessage({
      publicKey: keypair.publicKey(),
      message,
      signature: keypair.sign(hash(Buffer.from(message, "utf8"))).toString("base64"),
    }),
    true,
  );
});

test("verifySignedMessage rejects malformed signature lengths", () => {
  assert.throws(
    () =>
      verifySignedMessage({
        publicKey: keypair.publicKey(),
        message,
        signature: "not-a-signature",
      }),
    /Invalid Stellar signature/,
  );
});

test("verifySignedMessage accepts SEP-53 prefixed signatures", () => {
  const sep53Payload = hash(
    Buffer.concat([Buffer.from("Stellar Signed Message:\n", "utf8"), Buffer.from(message, "utf8")]),
  );
  assert.equal(
    verifySignedMessage({
      publicKey: keypair.publicKey(),
      message,
      signature: keypair.sign(sep53Payload).toString("base64"),
    }),
    true,
  );
});
