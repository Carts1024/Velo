import assert from "node:assert/strict";
import test from "node:test";

import { publicPaymentIntentFromDocV2 } from "../../core/api/payment-intents.ts";

test("public payment intent v2 mapper returns full contract shape", () => {
  const intent = publicPaymentIntentFromDocV2(
    {
      _id: "pi_test_123",
      status: "created",
      amount: "10.00",
      asset: "USDC",
      description: undefined,
      successUrl: "https://merchant.example/success",
      cancelUrl: undefined,
      expiresAt: 1782865800000,
      createdAt: 1782864000000,
      updatedAt: 1782864000000,
      anchor: "pdax",
      receiverAddress: "G-DEPOSIT-ADDRESS",
      receiverMemo: "123456",
      anchorDepositCurrency: "USDCXLM",
      payerAddress: undefined,
    },
    "https://app.velo.example",
  );

  assert.equal(intent.id, "pi_test_123");
  assert.equal(intent.object, "payment_intent");
  assert.equal(intent.paymentIntentId, "pi_test_123");
  assert.equal(intent.checkoutUrl, "https://app.velo.example/pay/pi_test_123");
  assert.equal(intent.description, null);
  assert.equal(intent.successUrl, "https://merchant.example/success");
  assert.equal(intent.cancelUrl, null);
  assert.equal(intent.anchor, "pdax");
  assert.equal(intent.receiverAddress, "G-DEPOSIT-ADDRESS");
  assert.equal(intent.receiverMemo, "123456");
  assert.equal(intent.anchorDepositCurrency, "USDCXLM");
  assert.equal(intent.payerAddress, null);
  assert.equal(intent.createdAt, "2026-07-01T00:00:00.000Z");
});

test("public payment intent v2 mapper defaults to inhouse anchor and nulls missing optionals", () => {
  const intent = publicPaymentIntentFromDocV2(
    {
      _id: "pi_test_123",
      status: "created",
      amount: "10.00",
      asset: "native",
      receiverAddress: "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP",
      expiresAt: 1782865800000,
      createdAt: 1782864000000,
      updatedAt: 1782864000000,
    },
    "https://app.velo.example",
  );

  assert.equal(intent.anchor, "inhouse");
  assert.equal(intent.receiverAddress, "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP");
  assert.equal(intent.receiverMemo, null);
  assert.equal(intent.anchorDepositCurrency, null);
  assert.equal(intent.payerAddress, null);
});

test("public payment intent v2 mapper exposes an unresolved asynchronous route safely", () => {
  const intent = publicPaymentIntentFromDocV2(
    {
      _id: "pi_awaiting_route",
      status: "awaiting_route",
      amount: "10.00",
      asset: "USDC",
      anchor: "pdax",
      expiresAt: 1782865800000,
      createdAt: 1782864000000,
      updatedAt: 1782864000000,
    },
    "https://app.velo.example",
  );
  assert.equal(intent.status, "awaiting_route");
  assert.equal(intent.receiverAddress, null);
});
