import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("checkout client does not mark Horizon submission success as paid", () => {
  const source = readFileSync(new URL("./checkout-client.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /status:\s*["']paid["']/);
  assert.match(source, /backend scanner confirms settlement/);
});

test("checkout client renders recipient details and memo based on anchor", () => {
  const source = readFileSync(new URL("./checkout-client.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /intent\.anchor\s*===\s*["']pdax["']\s*\?\s*["']PDAX Deposit Address["']\s*:\s*["']Recipient Address["']/,
  );
  assert.match(source, /intent\.receiverMemo/);
  assert.match(source, /memo:\s*intent\.receiverMemo/);
});

test("checkout client blocks payment while PDAX routing is unresolved", () => {
  const source = readFileSync(new URL("./checkout-client.tsx", import.meta.url), "utf8");
  assert.match(source, /intent\.status === ["']awaiting_route["']/);
  assert.match(source, /Preparing Payment Route/);
  assert.match(source, /!intent\.receiverAddress \|\| intent\.status !== ["']created["']/);
});
