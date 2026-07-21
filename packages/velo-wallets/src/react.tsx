"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import {
  getSharedVeloWalletClient,
  VeloWalletClient,
  type VeloWalletClientOptions,
} from "./browser.js";

const WalletContext = createContext<VeloWalletClient | null>(null);

export function VeloWalletProvider({
  projectKey,
  apiBaseUrl,
  children,
}: {
  projectKey: string;
  apiBaseUrl?: string;
  children: ReactNode;
}) {
  const client = useMemo(
    () =>
      typeof window === "undefined"
        ? new VeloWalletClient({ projectKey, apiBaseUrl })
        : getSharedVeloWalletClient({ projectKey, apiBaseUrl }),
    [apiBaseUrl, projectKey],
  );

  useEffect(() => {
    client.initialize().catch(() => undefined);
  }, [client]);

  return <WalletContext.Provider value={client}>{children}</WalletContext.Provider>;
}

export function useVeloWallet() {
  const client = useContext(WalletContext);
  if (!client) throw new Error("useVeloWallet must be used inside VeloWalletProvider.");
  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);

  return {
    ...state,
    connect: () => client.connect(),
    disconnect: () => client.disconnect(),
    getAddress: () => Promise.resolve(client.getAddress()),
    signTransaction: (xdr: string) => client.signTransaction(xdr),
    signAuthEntry: (authEntry: string) => client.signAuthEntry(authEntry),
    signMessage: (message: string) => client.signMessage(message),
    client,
  };
}

export function ConnectButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const wallet = useVeloWallet();
  const connected = wallet.status === "connected";
  const label = connected
    ? `${wallet.walletName ?? "Wallet"} · ${wallet.address?.slice(0, 7) ?? ""}…`
    : wallet.status === "connecting"
      ? "Connecting…"
      : "Connect wallet";

  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || wallet.status === "connecting" || wallet.status === "loading"}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) {
          const action = connected ? wallet.disconnect() : wallet.connect();
          action.catch(() => undefined);
        }
      }}
      aria-describedby={props["aria-describedby"] ?? "velo-wallet-status"}
    >
      {label}
      <span id="velo-wallet-status" role="status" aria-live="polite" hidden>
        {wallet.error?.message ?? wallet.status}
      </span>
    </button>
  );
}

export type { VeloWalletClientOptions };
