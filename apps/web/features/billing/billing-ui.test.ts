import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./billing-dashboard.tsx", import.meta.url), "utf8");
const paymentIntentRouteSource = readFileSync(
  new URL("../../core/api/payment-intent-route-handlers.ts", import.meta.url),
  "utf8",
);

test("billing dashboard exposes merchant balances, history, receipts, and disclosures", () => {
  assert.match(source, /Available/);
  assert.match(source, /Reserved/);
  assert.match(source, /Promotional/);
  assert.match(source, /Ledger/);
  assert.match(source, /Receipts/);
  assert.match(source, /PDAX and off-ramp charges/);
  assert.match(source, /merchant-customer refunds do not automatically restore/i);
});

test("operator controls are rendered only for authorized billing operators", () => {
  assert.match(source, /billing\.isOperator && <TabsTrigger value="operations">/);
  assert.match(source, /billing\.isOperator && \(/);
  assert.match(source, /Operator wallets/);
  assert.match(source, /Sandbox enforcement/);
  assert.match(source, /Open reconciliation exceptions/);
});

test("top-up flow uses the server-created PaymentIntent", () => {
  assert.match(source, /billing\/topups:create/);
  assert.match(source, /router\.push\(`\/pay\/\$\{result\.paymentIntentId\}`\)/);
});

test("insufficient billing credits return a structured payment-required response", () => {
  assert.match(paymentIntentRouteSource, /status: 402/);
  assert.match(paymentIntentRouteSource, /insufficient_billing_credits/);
});
