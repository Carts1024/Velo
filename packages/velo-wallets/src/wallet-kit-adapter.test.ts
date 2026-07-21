import { beforeEach, describe, expect, test, vi } from "vitest";

const kit = vi.hoisted(() => {
  const callbacks = new Map<string, (event: unknown) => void>();
  return {
    callbacks,
    init: vi.fn(),
    setNetwork: vi.fn(),
    on: vi.fn((type: string, callback: (event: unknown) => void) => {
      callbacks.set(type, callback);
      if (type === "state-updated") {
        callback({
          payload: {
            address: undefined,
            networkPassphrase: "Test SDF Network ; September 2015",
          },
        });
      }
      return vi.fn();
    }),
    get selectedModule(): never {
      throw { code: -3, message: "Please set the wallet first" };
    },
  };
});

vi.mock("@creit-tech/stellar-wallets-kit", () => ({
  KitEventType: {
    STATE_UPDATED: "state-updated",
    WALLET_SELECTED: "wallet-selected",
    DISCONNECT: "disconnect",
  },
  Networks: { PUBLIC: "public", TESTNET: "testnet" },
  StellarWalletsKit: kit,
}));

vi.mock("@creit-tech/stellar-wallets-kit/modules/utils", () => ({
  defaultModules: vi.fn(() => [{ productId: "freighter" }]),
}));

import { StellarWalletsKitAdapter, type WalletKitEvent } from "./wallet-kit-adapter.js";

const config = {
  schemaVersion: 1 as const,
  revision: 1,
  runtimeMajor: 1 as const,
  projectKey: "vw_pk_example",
  network: "testnet" as const,
  walletIds: ["freighter"],
  appearance: { theme: "system" as const, buttonLabel: "Connect wallet" },
  modal: { showInstallLabel: true, hideUnsupportedWallets: false },
  session: { persist: true },
};

describe("StellarWalletsKitAdapter", () => {
  beforeEach(() => {
    kit.callbacks.clear();
    vi.clearAllMocks();
  });

  test("initializes before a wallet is selected", async () => {
    const adapter = new StellarWalletsKitAdapter();
    const events: WalletKitEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    await expect(adapter.initialize(config)).resolves.toBeUndefined();
    expect(events).toContainEqual({
      type: "changed",
      address: null,
      walletId: null,
      networkPassphrase: "Test SDF Network ; September 2015",
    });
  });
});
