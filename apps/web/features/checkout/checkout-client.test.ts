import assert from "node:assert/strict";
import test from "node:test";

import { formatAmount, formatAsset } from "./format.ts";

test("formatAsset returns XLM for native asset", () => {
  assert.equal(formatAsset("native"), "XLM");
  assert.equal(formatAsset("XLM"), "XLM");
});

test("formatAsset extracts code from CODE:ISSUER format", () => {
  assert.equal(formatAsset("USDC:GBX5S..."), "USDC");
  assert.equal(formatAsset("ARST:GBX5S..."), "ARST");
});

test("formatAmount formats numbers with minimum fraction digits and appends formatted asset", () => {
  assert.equal(formatAmount("10", "native"), "10.00 XLM");
  assert.equal(formatAmount("150.5", "USDC:GBX5S..."), "150.50 USDC");
  assert.equal(formatAmount("invalid", "native"), "invalid XLM");
});
