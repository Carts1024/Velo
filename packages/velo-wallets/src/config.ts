import { VeloWalletError } from "./errors.js";

export type WalletNetwork = "testnet" | "public";
export type WalletTheme = "light" | "dark" | "system";

export type WalletCatalogEntry = {
  id: string;
  name: string;
  transactionSigning: true;
  authEntrySigning: "supported" | "wallet-dependent";
  messageSigning: "supported" | "wallet-dependent";
};

export const WALLET_CATALOG = [
  { id: "albedo", name: "Albedo" },
  { id: "freighter", name: "Freighter" },
  { id: "fordefi", name: "Fordefi" },
  { id: "rabet", name: "Rabet" },
  { id: "xbull", name: "xBull" },
  { id: "lobstr", name: "LOBSTR" },
  { id: "hana", name: "Hana Wallet" },
  { id: "klever", name: "Klever Wallet" },
  { id: "onekey", name: "OneKey Wallet" },
  { id: "BitgetWallet", name: "Bitget Wallet" },
  { id: "cactuslink", name: "Cactus Link" },
].map(
  (wallet): WalletCatalogEntry => ({
    ...wallet,
    transactionSigning: true,
    authEntrySigning: "wallet-dependent",
    messageSigning: "wallet-dependent",
  }),
);

export const WALLET_IDS = WALLET_CATALOG.map((wallet) => wallet.id);

export type WalletDraftConfig = {
  network: WalletNetwork;
  walletIds: string[];
  theme: WalletTheme;
  buttonLabel: string;
  showInstallLabel: boolean;
  hideUnsupportedWallets: boolean;
  persistSession: boolean;
  allowedOrigins: string[];
};

export type PublishedWalletConfig = {
  schemaVersion: 1;
  revision: number;
  runtimeMajor: 1;
  projectKey: string;
  network: WalletNetwork;
  walletIds: string[];
  appearance: { theme: WalletTheme; buttonLabel: string };
  modal: { showInstallLabel: boolean; hideUnsupportedWallets: boolean };
  session: { persist: boolean };
};

export const DEFAULT_WALLET_CONFIG: WalletDraftConfig = {
  network: "testnet",
  walletIds: ["freighter"],
  theme: "system",
  buttonLabel: "Connect wallet",
  showInstallLabel: true,
  hideUnsupportedWallets: false,
  persistSession: true,
  allowedOrigins: ["http://localhost:3000"],
};

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function normalizeAllowedOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Allowed origin must be a valid HTTP or HTTPS origin.");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Allowed origin must use HTTP or HTTPS without credentials.");
  }
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    throw new Error("Allowed origin cannot include a path, query, or fragment.");
  }

  return url.origin;
}

export function validateWalletDraft(config: WalletDraftConfig) {
  const errors: string[] = [];
  const uniqueWalletIds = new Set(config.walletIds);
  if (uniqueWalletIds.size === 0) errors.push("Select at least one wallet.");
  if (uniqueWalletIds.size !== config.walletIds.length) errors.push("Wallets must be unique.");
  if (config.walletIds.some((walletId) => !WALLET_IDS.includes(walletId))) {
    errors.push("One or more selected wallets are unsupported.");
  }
  const labelLength = config.buttonLabel.trim().length;
  if (labelLength < 1 || labelLength > 40) {
    errors.push("Button label must be between 1 and 40 characters.");
  }
  if (config.allowedOrigins.length > 20) errors.push("A maximum of 20 origins is allowed.");

  const normalizedOrigins: string[] = [];
  for (const origin of config.allowedOrigins) {
    try {
      normalizedOrigins.push(normalizeAllowedOrigin(origin));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid allowed origin.");
    }
  }

  if (new Set(normalizedOrigins).size !== normalizedOrigins.length) {
    errors.push("Allowed origins must be unique.");
  }

  if (
    config.network === "public" &&
    !normalizedOrigins.some((origin) => {
      const url = new URL(origin);
      return url.protocol === "https:" && !isLocalHostname(url.hostname);
    })
  ) {
    errors.push("Mainnet requires at least one non-local HTTPS origin.");
  }

  return [...new Set(errors)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePublishedWalletConfig(value: unknown): PublishedWalletConfig {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.runtimeMajor !== 1) {
    throw new VeloWalletError(
      "CONFIG_INCOMPATIBLE",
      "CONFIG_INCOMPATIBLE: Velo Wallets configuration is not compatible with runtime v1.",
    );
  }

  const appearance = value.appearance;
  const modal = value.modal;
  const session = value.session;
  if (
    typeof value.revision !== "number" ||
    typeof value.projectKey !== "string" ||
    (value.network !== "testnet" && value.network !== "public") ||
    !Array.isArray(value.walletIds) ||
    value.walletIds.some((id) => typeof id !== "string" || !WALLET_IDS.includes(id)) ||
    !isRecord(appearance) ||
    !["light", "dark", "system"].includes(String(appearance.theme)) ||
    typeof appearance.buttonLabel !== "string" ||
    !isRecord(modal) ||
    typeof modal.showInstallLabel !== "boolean" ||
    typeof modal.hideUnsupportedWallets !== "boolean" ||
    !isRecord(session) ||
    typeof session.persist !== "boolean"
  ) {
    throw new VeloWalletError(
      "CONFIG_INCOMPATIBLE",
      "CONFIG_INCOMPATIBLE: Published wallet configuration is malformed.",
    );
  }

  return value as PublishedWalletConfig;
}

export function draftToPublishedConfig(
  draft: WalletDraftConfig,
  projectKey: string,
  revision: number,
): PublishedWalletConfig {
  return {
    schemaVersion: 1,
    revision,
    runtimeMajor: 1,
    projectKey,
    network: draft.network,
    walletIds: [...draft.walletIds],
    appearance: { theme: draft.theme, buttonLabel: draft.buttonLabel.trim() },
    modal: {
      showInstallLabel: draft.showInstallLabel,
      hideUnsupportedWallets: draft.hideUnsupportedWallets,
    },
    session: { persist: draft.persistSession },
  };
}
