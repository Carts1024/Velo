import type { PublishedWalletConfig } from "./config.js";

export type WalletKitSession = { address: string; walletId: string | null };
export type WalletKitEvent =
  | { type: "changed"; address: string | null; walletId: string | null; networkPassphrase?: string }
  | { type: "disconnected" };

export interface WalletKitAdapter {
  initialize(config: PublishedWalletConfig): Promise<void>;
  connect(): Promise<WalletKitSession>;
  disconnect(): Promise<void>;
  signTransaction(xdr: string, address: string): Promise<string>;
  signAuthEntry(authEntry: string, address: string): Promise<string>;
  signMessage(message: string, address: string): Promise<string>;
  subscribe(listener: (event: WalletKitEvent) => void): () => void;
  restoreSession?(session: WalletKitSession): Promise<WalletKitSession | null>;
}

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";

export function networkPassphrase(config: PublishedWalletConfig) {
  return config.network === "public" ? PUBLIC_PASSPHRASE : TESTNET_PASSPHRASE;
}

export class StellarWalletsKitAdapter implements WalletKitAdapter {
  private config: PublishedWalletConfig | null = null;
  private listeners = new Set<(event: WalletKitEvent) => void>();
  private unsubscribers: Array<() => void> = [];

  async initialize(config: PublishedWalletConfig) {
    if (typeof window === "undefined") throw new Error("Wallet runtime requires a browser.");
    this.config = config;
    const [{ StellarWalletsKit, KitEventType, Networks }, { defaultModules }] = await Promise.all([
      import("@creit-tech/stellar-wallets-kit"),
      import("@creit-tech/stellar-wallets-kit/modules/utils"),
    ]);
    const modules = defaultModules({
      filterBy: (module) => config.walletIds.includes(module.productId),
    });
    StellarWalletsKit.init({
      modules,
      network: config.network === "public" ? Networks.PUBLIC : Networks.TESTNET,
      authModal: config.modal,
    });
    StellarWalletsKit.setNetwork(config.network === "public" ? Networks.PUBLIC : Networks.TESTNET);

    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [
      StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
        this.emit({
          type: "changed",
          address: event.payload.address ?? null,
          walletId: null,
          networkPassphrase: event.payload.networkPassphrase,
        });
      }),
      StellarWalletsKit.on(KitEventType.WALLET_SELECTED, (event) => {
        this.emit({
          type: "changed",
          address: null,
          walletId: event.payload.id ?? null,
        });
      }),
      StellarWalletsKit.on(KitEventType.DISCONNECT, () => this.emit({ type: "disconnected" })),
    ];
  }

  async connect() {
    const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
    const result = await StellarWalletsKit.authModal();
    return {
      address: result.address,
      walletId: StellarWalletsKit.selectedModule?.productId ?? null,
    };
  }

  async restoreSession(session: WalletKitSession) {
    try {
      const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
      if (session.walletId) StellarWalletsKit.setWallet(session.walletId);
      const result = await StellarWalletsKit.getAddress();
      return result.address === session.address ? session : null;
    } catch {
      return null;
    }
  }

  async disconnect() {
    const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
    await StellarWalletsKit.disconnect();
  }

  async signTransaction(xdr: string, address: string) {
    const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
    const result = await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase: this.requirePassphrase(),
      address,
    });
    return result.signedTxXdr;
  }

  async signAuthEntry(authEntry: string, address: string) {
    const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
    const result = await StellarWalletsKit.signAuthEntry(authEntry, {
      networkPassphrase: this.requirePassphrase(),
      address,
    });
    return result.signedAuthEntry;
  }

  async signMessage(message: string, address: string) {
    const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
    const result = await StellarWalletsKit.signMessage(message, {
      networkPassphrase: this.requirePassphrase(),
      address,
    });
    return result.signedMessage;
  }

  subscribe(listener: (event: WalletKitEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: WalletKitEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  private requirePassphrase() {
    if (!this.config) throw new Error("Wallet adapter is not initialized.");
    return networkPassphrase(this.config);
  }
}
