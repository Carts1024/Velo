import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync("features/playground/playground-client.tsx", "utf8");
const page = readFileSync("app/playground/page.tsx", "utf8");
const shell = readFileSync("core/app-shell.tsx", "utf8");
const sidebar = readFileSync(
  "../../packages/ui/src/components/ui-customs/sidebar/app-sidebar.tsx",
  "utf8",
);

test("Playground is an anonymous AppShell route backed by the existing wallet provider", () => {
  assert.match(page, /<AppShell>/);
  assert.match(shell, /pathname !== "\/playground"/);
  assert.match(client, /useWallet\(\)/);
  assert.doesNotMatch(client, /StellarWalletsKit|@carts1024\/velo-wallets/);
  assert.match(sidebar, /title: "Playground"/);
  assert.match(sidebar, /url: "\/playground"/);
});

test("Playground renders responsive load, retry, inspection, and accessibility states", () => {
  assert.match(client, /Loading…/);
  assert.match(client, /\bRetry\b/);
  assert.match(client, /No contract specification loaded/);
  assert.match(client, /Search functions/);
  assert.match(client, /Referenced custom types/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /sm:grid-cols-2/);
  assert.match(client, /lg:grid-cols/);
});

test("Playground distinguishes Mainnet, wallet, pending, success, and failure states", () => {
  assert.match(client, /Mainnet is inspection-only/);
  assert.match(client, /Wallet request rejected/);
  assert.match(client, /Transaction pending/);
  assert.match(client, /Transaction succeeded/);
  assert.match(client, /Contract transaction failed/);
  assert.match(client, /assertWalletEnvelopeMatchesReview/);
});
