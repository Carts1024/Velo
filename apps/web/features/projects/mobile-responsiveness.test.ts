import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path: string) => fs.readFileSync(path, "utf8");

const appShell = read("core/app-shell.tsx");
const layout = read("app/layout.tsx");
const docs = read("app/docs/page.tsx");
const contracts = read("features/projects/project-contracts.tsx");
const events = read("features/projects/project-events.tsx");
const webhooks = read("features/projects/project-webhooks.tsx");
const apiKeys = read("features/projects/project-api-keys.tsx");
const settlement = read("features/projects/project-settlement.tsx");
const wallets = read("features/projects/project-wallets.tsx");
const publicVerification = read("features/projects/public-verification.tsx");

test("app shell constrains intrinsic width and respects installed-app safe areas", () => {
  assert.match(appShell, /min-h-dvh min-w-0 max-w-full/);
  assert.match(appShell, /overflow-x-clip overflow-y-auto/);
  assert.match(appShell, /safe-area-inset-top/);
  assert.match(appShell, /safe-area-inset-bottom/);
  assert.match(layout, /viewportFit: "cover"/);
});

test("dense operational tables progressively reveal secondary columns", () => {
  assert.match(contracts, /whitespace-normal break-all/);
  assert.match(events, /hidden lg:table-cell">Transaction/);
  assert.match(webhooks, /hidden lg:table-cell">Latency/);
  assert.match(apiKeys, /hidden lg:table-cell">Created/);
  assert.match(settlement, /hidden py-2 text-xs lg:table-cell"[^>]*>\s*Idempotency ID/);
});

test("docs and configuration pages provide narrow-screen layouts", () => {
  assert.match(docs, /id="mobile-doc-section"/);
  assert.match(docs, /md:h-\[calc\(100dvh-220px\)\]/);
  assert.match(wallets, /grid min-w-0 gap-6/);
  assert.match(publicVerification, /whitespace-normal break-all font-mono/);
});
