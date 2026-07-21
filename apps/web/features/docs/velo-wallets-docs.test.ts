import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const docs = fs.readFileSync("app/docs/page.tsx", "utf8");

test("Docs page gives Velo Wallets its own beginner navigation", () => {
  assert.match(docs, /title: "Wallets Quickstart", category: "Velo Wallets"/);
  assert.match(docs, /title: "Configure & Publish", category: "Velo Wallets"/);
  assert.match(docs, /title: "Use with HTML", category: "Velo Wallets"/);
  assert.match(docs, /title: "Use with React", category: "Velo Wallets"/);
  assert.match(docs, /title: "Methods & Troubleshooting", category: "Velo Wallets"/);
});

test("Wallets guide covers the safe configure, publish, and diagnostics journey", () => {
  assert.match(docs, /Keep the Testnet preset/);
  assert.match(docs, /Add allowed origins/);
  assert.match(docs, /Save draft/);
  assert.match(docs, /Publish revision/);
  assert.match(docs, /Mainnet requires extra confirmation/);
  assert.match(docs, /isolated diagnostics page/);
  assert.match(docs, /never submitted/);
  assert.match(docs, /first save creates the public project key/);
  assert.match(docs, /Test the publication before editing your app/);
  assert.match(docs, /transaction-signing check only while the published\s+network is Testnet/);
});

test("Wallets guide includes complete HTML and React examples", () => {
  assert.match(docs, /https:\/\/wallets\.velo\.dev\/v1\/velo-wallet\.js/);
  assert.match(docs, /<velo-wallet project-key=/);
  assert.match(docs, /velo:wallet-connected/);
  assert.match(docs, /VeloWalletProvider/);
  assert.match(docs, /WalletWidget/);
  assert.match(docs, /useVeloWallet/);
  assert.match(docs, /signTransaction/);
  assert.match(docs, /Content-Security-Policy/);
});

test("Wallets guide clearly separates public browser keys from private server keys", () => {
  assert.match(docs, /Never put a private Velo API key in a wallet component/);
  assert.match(docs, /Signing stays in the browser/);
  assert.match(docs, /does not receive your transaction XDR/);
  assert.match(docs, /Staged alpha package/);
});

test("Wallets reference documents complete public contracts and accessible docs feedback", () => {
  assert.match(docs, /connect\(\): Promise/);
  assert.match(docs, /\{ version: 1, address \}/);
  assert.match(docs, /Use one project key per browser document/);
  assert.match(docs, /CONFIG_INCOMPATIBLE/);
  assert.match(docs, /POPUP_BLOCKED/);
  assert.match(docs, /SIGNING_FAILED/);
  assert.match(docs, /aria-current=/);
  assert.match(docs, /Code copied to clipboard/);
  assert.match(docs, /sectionHeadingRef/);
});
