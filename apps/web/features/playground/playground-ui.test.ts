import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync("features/playground/playground-client.tsx", "utf8");
const transactionService = readFileSync(
  "features/playground/server/transaction-service.ts",
  "utf8",
);
const page = readFileSync("app/playground/page.tsx", "utf8");
const shell = readFileSync("core/app-shell.tsx", "utf8");
const walletProvider = readFileSync("core/wallet/wallet-provider.tsx", "utf8");
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
  assert.match(client, /ArgumentEditor/);
  assert.match(client, /useState<Record<string, FunctionArgumentDraft>>/);
  assert.match(client, /argumentDrafts\[selected\.name\]/);
  assert.match(client, /setArgumentDrafts\(\{\}\)/);
});

test("Playground distinguishes Mainnet, wallet, pending, success, and failure states", () => {
  assert.match(client, /Mainnet · simulation only/);
  assert.match(client, /will never sign or submit/);
  assert.match(client, /Wallet request rejected/);
  assert.match(client, /\bDisconnect\b/);
  assert.match(client, /wallet\.errorCode/);
  assert.match(client, /Transaction pending/);
  assert.match(client, /Transaction status unresolved/);
  assert.match(client, /Check again/);
  assert.match(client, /Transaction succeeded/);
  assert.match(client, /Contract transaction failed/);
  assert.match(client, /assertWalletEnvelopeMatchesReview/);
});

test("Sprint 3 preflight uses canonical arguments and guards stale signing", () => {
  assert.match(client, /Simulation and preflight/);
  assert.match(client, /expectedWasmHash: contract\.wasmHash/);
  assert.match(client, /expectedSpecHash: contract\.specHash/);
  assert.match(client, /arguments: selectedDraft\.value/);
  assert.match(client, /createSimulationContextKey/);
  assert.match(client, /simulationFreshness/);
  assert.match(client, /simulationAbort\.current\?\.abort/);
  assert.match(client, /requestNumber !== simulationRequest\.current/);
  assert.match(client, /freshness !== "fresh"/);
  assert.match(client, /reviewConfirmed/);
  assert.match(client, /reviewedFingerprint/);
  assert.match(client, /expectedWasmHash: simulation\.request\.expectedWasmHash/);
  assert.match(transactionService, /No writes detected in this simulation/);
  assert.match(client, /Raw simulation evidence/);
  assert.match(client, /Copy diagnostics/);
});

test("Sprint 4 review, lifecycle recovery, and result evidence are explicit", () => {
  assert.match(client, /transactionLifecycleReducer/);
  assert.match(client, /PLAYGROUND_PENDING_STORAGE_KEY/);
  assert.match(client, /parsePendingTransaction/);
  assert.match(client, /sessionStorage\.setItem/);
  assert.match(client, /Exact unsigned XDR/);
  assert.match(client, /Predicted writes/);
  assert.match(client, /Raw execution evidence/);
  assert.match(client, /Raw final XDR evidence/);
  assert.match(client, /Fee charged/);
});

test("global wallet provider exposes actionable, non-breaking typed errors", () => {
  assert.match(walletProvider, /export type WalletErrorCode/);
  assert.match(walletProvider, /WALLET_REJECTED/);
  assert.match(walletProvider, /WALLET_UNAVAILABLE/);
  assert.match(walletProvider, /WALLET_STALE_SESSION/);
  assert.match(walletProvider, /WALLET_NETWORK_MISMATCH/);
  assert.match(walletProvider, /WALLET_SIGNING_FAILED/);
  assert.match(walletProvider, /errorCode: WalletErrorCode \| null/);
});

const argumentEditor = readFileSync("features/playground/argument-editor.tsx", "utf8");

test("argument editor exposes synchronized Form/JSON, accessible actions, and guarded preview", () => {
  assert.match(argumentEditor, /Argument builder/);
  assert.match(argumentEditor, /\bForm\b/);
  assert.match(argumentEditor, /\bJSON\b/);
  assert.match(argumentEditor, /Reset .* arguments to examples/);
  assert.match(argumentEditor, /Copy value/);
  assert.match(argumentEditor, /aria-live="polite"/);
  assert.match(argumentEditor, /role="alert"/);
  assert.match(argumentEditor, /readOnly/);
  assert.match(argumentEditor, /Encoded ScVal preview/);
  assert.match(argumentEditor, /Move .* up/);
  assert.match(argumentEditor, /Remove/);
  assert.match(argumentEditor, /Address classification/);
  assert.match(argumentEditor, /depth > ARGUMENT_LIMITS\.depth/);
  assert.match(argumentEditor, /disabled=\{values\.length >= ARGUMENT_LIMITS\.collectionEntries\}/);
  assert.match(argumentEditor, /data-argument-struct-field=\{field\.name\}/);
  assert.doesNotMatch(argumentEditor, /<label key=\{field\.name\}/);
});
