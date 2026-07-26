import assert from "node:assert/strict";
import test from "node:test";

import {
  effectivePaymentStatus,
  formatPaymentAsset,
  paymentLifecycle,
  validatePaymentAmount,
} from "./payment-ui.ts";

test("effectivePaymentStatus treats an overdue open intent as expired", () => {
  assert.equal(effectivePaymentStatus({ status: "created", expiresAt: 1_000 }, 1_001), "expired");
  assert.equal(effectivePaymentStatus({ status: "pending", expiresAt: 1_000 }, 1_001), "pending");
});

test("paymentLifecycle orders available stages and supplies terminal fallbacks", () => {
  assert.deepEqual(
    paymentLifecycle({
      status: "paid",
      createdAt: 100,
      updatedAt: 400,
      stageTimestamps: { created: 100, submitted: 200, confirmed: 400 },
    }),
    [
      { key: "created", label: "Created", timestamp: 100 },
      { key: "submitted", label: "Submitted", timestamp: 200 },
      { key: "confirmed", label: "Confirmed", timestamp: 400 },
    ],
  );
  assert.deepEqual(paymentLifecycle({ status: "failed", createdAt: 100, updatedAt: 300 }), [
    { key: "created", label: "Created", timestamp: 100 },
    { key: "failed", label: "Failed", timestamp: 300 },
  ]);
});

test("payment form helpers validate positive decimal amounts and format assets", () => {
  assert.equal(validatePaymentAmount("12.50"), null);
  assert.equal(validatePaymentAmount("0"), "Enter an amount greater than zero.");
  assert.equal(validatePaymentAmount("abc"), "Enter a valid decimal amount.");
  assert.equal(formatPaymentAsset("native"), "XLM");
  assert.equal(formatPaymentAsset("USDC:GISSUER"), "USDC");
});
