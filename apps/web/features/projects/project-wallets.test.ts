import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const panel = fs.readFileSync("features/projects/project-wallets.tsx", "utf8");
const page = fs.readFileSync("app/projects/[projectId]/wallets/page.tsx", "utf8");
const preview = fs.readFileSync("app/wallet-preview/[publicKey]/route.ts", "utf8");
const sidebar = fs.readFileSync(
  "../../packages/ui/src/components/ui-customs/sidebar/app-sidebar.tsx",
  "utf8",
);

test("Wallets panel exposes configuration and publication lifecycle", () => {
  assert.match(panel, /Guided Testnet preset/);
  assert.match(panel, /WALLET_CATALOG/);
  assert.match(panel, /Allowed origins/);
  assert.match(panel, /Save draft/);
  assert.match(panel, /Publish revision/);
  assert.match(panel, /Disable integration/);
  assert.match(panel, /Component preview/);
  assert.match(panel, /Integration instructions/);
  assert.match(panel, /aria-live="polite"/);
});

test("Wallets route is project-scoped and navigable", () => {
  assert.match(page, /<AppShell>/);
  assert.match(page, /<ProjectWallets projectId=\{projectId\}/);
  assert.match(sidebar, /title: "Wallets"/);
  assert.match(sidebar, /`\$\{projectBaseUrl\}\/wallets`/);
});

test("isolated diagnostics exercises local message and Testnet transaction signing", () => {
  assert.doesNotMatch(preview, /<AppShell>/);
  assert.match(preview, /wallet\.signMessage/);
  assert.match(preview, /wallet\.signTransaction/);
  assert.match(preview, /horizon-testnet\.stellar\.org/);
  assert.match(preview, /NOT submitted/);
});
