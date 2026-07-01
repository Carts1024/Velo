import crypto from "crypto";
import assert from "node:assert/strict";
import test from "node:test";

import { Velo } from "./client.ts";
import { VeloWebhookSignatureVerificationError } from "./errors.ts";
import { verifyWebhookSignature } from "./webhooks.ts";

function generateTestSignatureHeader(payload: string, secret: string, timestamp: number): string {
  const signaturePayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signaturePayload);
  const hash = hmac.digest("hex");
  return `t=${timestamp},v1=${hash}`;
}

test("verifyWebhookSignature parses valid signature and payload", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({
    id: "evt_123",
    type: "payment.succeeded",
    test: true,
    sentAt: new Date().toISOString(),
    project: {
      id: "proj_123",
      registryProjectId: "reg_123",
      name: "Test Project",
      slug: "test-project",
    },
    paymentIntent: {
      id: "pi_123",
      amount: "10.00",
      asset: "USDC",
      receiverAddress: "GBA...",
      merchantName: "Merchant Name",
      description: "Test description",
      status: "paid",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureHeader = generateTestSignatureHeader(payload, secret, timestamp);

  // Directly calling verifyWebhookSignature helper
  const event = await verifyWebhookSignature({
    payload,
    signature: signatureHeader,
    secret,
  });

  assert.equal(event.id, "evt_123");
  assert.equal(event.type, "payment.succeeded");
  assert.equal(event.test, true);
  if (event.type === "payment.succeeded") {
    assert.equal(event.paymentIntent.id, "pi_123");
    assert.equal(event.paymentIntent.amount, "10.00");
  } else {
    assert.fail("Event type should be payment.succeeded");
  }

  // Testing Velo static verification
  const staticEvent = await Velo.webhooks.verify({
    payload,
    signature: signatureHeader,
    secret,
  });
  assert.equal(staticEvent.id, "evt_123");

  // Testing Velo instance verification
  const velo = new Velo({ apiKey: "test-key" });
  const instanceEvent = await velo.webhooks.verify({
    payload,
    signature: signatureHeader,
    secret,
  });
  assert.equal(instanceEvent.id, "evt_123");
});

test("verifyWebhookSignature rejects missing signature header", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({ type: "payment.succeeded" });

  await assert.rejects(
    () => verifyWebhookSignature({ payload, signature: null, secret }),
    (err: unknown) => {
      assert.equal(err instanceof VeloWebhookSignatureVerificationError, true);
      assert.equal(
        (err as VeloWebhookSignatureVerificationError).message,
        "Missing signature header",
      );
      return true;
    },
  );
});

test("verifyWebhookSignature rejects malformed headers", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({ type: "payment.succeeded" });

  await assert.rejects(
    () => verifyWebhookSignature({ payload, signature: "invalid-header", secret }),
    (err: unknown) => {
      assert.equal(err instanceof VeloWebhookSignatureVerificationError, true);
      assert.equal(
        (err as VeloWebhookSignatureVerificationError).message,
        "Invalid signature header format",
      );
      return true;
    },
  );

  await assert.rejects(
    () => verifyWebhookSignature({ payload, signature: "t=123", secret }),
    (err: unknown) => {
      assert.equal(err instanceof VeloWebhookSignatureVerificationError, true);
      assert.equal(
        (err as VeloWebhookSignatureVerificationError).message,
        "Invalid signature header format",
      );
      return true;
    },
  );
});

test("verifyWebhookSignature rejects expired timestamps", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({ type: "payment.succeeded" });
  const timestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago (tolerance default is 5 mins)
  const signatureHeader = generateTestSignatureHeader(payload, secret, timestamp);

  await assert.rejects(
    () => verifyWebhookSignature({ payload, signature: signatureHeader, secret }),
    (err: unknown) => {
      assert.equal(err instanceof VeloWebhookSignatureVerificationError, true);
      assert.match((err as VeloWebhookSignatureVerificationError).message, /timestamp expired/);
      return true;
    },
  );
});

test("verifyWebhookSignature rejects future timestamps", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({ type: "payment.succeeded" });
  const timestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in the future
  const signatureHeader = generateTestSignatureHeader(payload, secret, timestamp);

  await assert.rejects(
    () => verifyWebhookSignature({ payload, signature: signatureHeader, secret }),
    (err: unknown) => {
      assert.equal(err instanceof VeloWebhookSignatureVerificationError, true);
      assert.match((err as VeloWebhookSignatureVerificationError).message, /timestamp expired/);
      return true;
    },
  );
});

test("verifyWebhookSignature rejects signature mismatch", async () => {
  const secret = "whsec_testsecret12345";
  const payload = JSON.stringify({ type: "payment.succeeded" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureHeader = generateTestSignatureHeader(payload, secret, timestamp);

  // Mismatched secret
  await assert.rejects(
    () =>
      verifyWebhookSignature({ payload, signature: signatureHeader, secret: "whsec_wrongsecret" }),
    (err: unknown) => {
      assert.equal(err instanceof VeloWebhookSignatureVerificationError, true);
      assert.equal((err as VeloWebhookSignatureVerificationError).message, "Signature mismatch");
      return true;
    },
  );

  // Mismatched payload (tampering)
  await assert.rejects(
    () =>
      verifyWebhookSignature({ payload: payload + "altered", signature: signatureHeader, secret }),
    (err: unknown) => {
      assert.equal(err instanceof VeloWebhookSignatureVerificationError, true);
      assert.equal((err as VeloWebhookSignatureVerificationError).message, "Signature mismatch");
      return true;
    },
  );
});
