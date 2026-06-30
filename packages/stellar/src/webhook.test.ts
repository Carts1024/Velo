import crypto from "crypto";
import assert from "node:assert/strict";
import test from "node:test";

import { verifyWebhookSignature } from "./webhook.ts";

function generateTestSignatureHeader(payload: string, secret: string, timestamp: number): string {
  const signaturePayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signaturePayload);
  const hash = hmac.digest("hex");
  return `t=${timestamp},v1=${hash}`;
}

test("verifyWebhookSignature parses valid signature and payload", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({ event: "test", data: { id: 1 } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureHeader = generateTestSignatureHeader(payload, secret, timestamp);

  const result = await verifyWebhookSignature(payload, signatureHeader, secret);
  assert.equal(result.isValid, true);
  assert.deepEqual(result.payload, { event: "test", data: { id: 1 } });
  assert.equal(result.error, undefined);
});

test("verifyWebhookSignature rejects expired timestamps", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({ event: "test" });
  const timestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
  const signatureHeader = generateTestSignatureHeader(payload, secret, timestamp);

  const result = await verifyWebhookSignature(payload, signatureHeader, secret, 300);
  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /Signature timestamp expired/);
});

test("verifyWebhookSignature rejects signature mismatch", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({ event: "test" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureHeader = generateTestSignatureHeader(payload, secret, timestamp);

  // Mismatched secret
  const resultWrongSecret = await verifyWebhookSignature(
    payload,
    signatureHeader,
    "whsec_wrongsecret",
  );
  assert.equal(resultWrongSecret.isValid, false);
  assert.match(resultWrongSecret.error ?? "", /Signature mismatch/);

  // Mismatched payload
  const resultWrongPayload = await verifyWebhookSignature(
    payload + "altered",
    signatureHeader,
    secret,
  );
  assert.equal(resultWrongPayload.isValid, false);
  assert.match(resultWrongPayload.error ?? "", /Signature mismatch/);
});

test("verifyWebhookSignature rejects malformed headers", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({ event: "test" });

  const result1 = await verifyWebhookSignature(payload, "invalid-header", secret);
  assert.equal(result1.isValid, false);
  assert.match(result1.error ?? "", /Invalid signature header format/);

  const result2 = await verifyWebhookSignature(payload, "t=123", secret);
  assert.equal(result2.isValid, false);
  assert.match(result2.error ?? "", /Invalid signature header format/);
});
