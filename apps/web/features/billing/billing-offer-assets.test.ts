import assert from "node:assert/strict";
import test from "node:test";

import { formatBillingOfferAsset, resolveBillingOfferAsset } from "./billing-offer-assets.ts";

test("configured USDC resolves to its canonical Stellar asset", () => {
  assert.equal(resolveBillingOfferAsset("USDC", "gissuer"), "USDC:GISSUER");
});

test("XLM resolves to the canonical native Stellar asset", () => {
  assert.equal(resolveBillingOfferAsset("XLM", undefined), "native");
});

test("USDC cannot be selected without a configured issuer", () => {
  assert.throws(
    () => resolveBillingOfferAsset("USDC", undefined),
    /NEXT_PUBLIC_USDC_ISSUER must be configured/,
  );
});

test("unsupported offer assets are rejected", () => {
  assert.throws(() => resolveBillingOfferAsset("BTC", "gissuer"), /Choose USDC or XLM/);
});

test("canonical native assets are presented to operators as XLM", () => {
  assert.equal(formatBillingOfferAsset("native"), "XLM");
  assert.equal(formatBillingOfferAsset("USDC:GISSUER"), "USDC");
});
