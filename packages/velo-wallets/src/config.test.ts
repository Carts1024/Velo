import { describe, expect, test } from "vitest";

import {
  DEFAULT_WALLET_CONFIG,
  WALLET_CATALOG,
  normalizeAllowedOrigin,
  parsePublishedWalletConfig,
  validateWalletDraft,
} from "./config.js";

describe("wallet configuration", () => {
  test("ships the pinned credential-free Wallets Kit catalog", () => {
    expect(WALLET_CATALOG.map((wallet) => wallet.name)).toEqual([
      "Albedo",
      "Freighter",
      "Fordefi",
      "Rabet",
      "xBull",
      "LOBSTR",
      "Hana Wallet",
      "Klever Wallet",
      "OneKey Wallet",
      "Bitget Wallet",
      "Cactus Link",
    ]);
  });

  test("uses a beginner-safe Testnet preset", () => {
    expect(DEFAULT_WALLET_CONFIG).toMatchObject({
      network: "testnet",
      walletIds: ["freighter"],
      theme: "system",
      persistSession: true,
      allowedOrigins: ["http://localhost:3000"],
    });
  });

  test("normalizes exact origins and rejects paths", () => {
    expect(normalizeAllowedOrigin("https://Example.com/")).toBe("https://example.com");
    expect(() => normalizeAllowedOrigin("https://example.com/app")).toThrow(/origin/i);
  });

  test("requires HTTPS non-local origins for Mainnet", () => {
    expect(
      validateWalletDraft({
        ...DEFAULT_WALLET_CONFIG,
        network: "public",
      }),
    ).toContain("Mainnet requires at least one non-local HTTPS origin.");
  });

  test("parses only compatible public configurations", () => {
    expect(
      parsePublishedWalletConfig({
        schemaVersion: 1,
        revision: 2,
        runtimeMajor: 1,
        projectKey: "vw_pk_example",
        network: "testnet",
        walletIds: ["freighter"],
        appearance: { theme: "system", buttonLabel: "Connect wallet" },
        modal: { showInstallLabel: true, hideUnsupportedWallets: false },
        session: { persist: true },
      }).revision,
    ).toBe(2);

    expect(() => parsePublishedWalletConfig({ schemaVersion: 2 })).toThrow(/CONFIG_INCOMPATIBLE/);
  });
});
