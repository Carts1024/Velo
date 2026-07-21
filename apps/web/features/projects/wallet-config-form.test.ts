import assert from "node:assert/strict";
import test from "node:test";

import { parseOriginLines, walletIntegrationSnippets } from "./wallet-config-form.ts";

test("origin editor removes empty lines and surrounding whitespace", () => {
  assert.deepEqual(parseOriginLines(" http://localhost:3000 \n\nhttps://app.example.com\n"), [
    "http://localhost:3000",
    "https://app.example.com",
  ]);
});

test("generated integration snippets use the active key and configured endpoints", () => {
  const snippets = walletIntegrationSnippets({
    projectKey: "vw_pk_example",
    cdnBaseUrl: "https://wallets.velo.dev/",
    apiBaseUrl: "https://app.velo.dev/",
  });
  assert.match(snippets.html, /https:\/\/wallets\.velo\.dev\/v1\/velo-wallet\.js/);
  assert.match(snippets.html, /project-key="vw_pk_example"/);
  assert.match(snippets.react, /VeloWalletProvider projectKey="vw_pk_example"/);
  assert.equal(
    snippets.csp,
    "script-src 'self' https://wallets.velo.dev; connect-src 'self' https://app.velo.dev",
  );
});
