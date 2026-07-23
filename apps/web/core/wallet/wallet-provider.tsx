"use client";

import { stellarConfig, STELLAR_TESTNET_NETWORK_PASSPHRASE } from "@/core/config/stellar";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type WalletStatus =
  | "initializing"
  | "ready"
  | "connected"
  | "connecting"
  | "disconnected"
  | "unavailable"
  | "rejected"
  | "unsupported"
  | "stale"
  | "error";

export type WalletErrorCode =
  | "WALLET_NOT_CONNECTED"
  | "WALLET_UNAVAILABLE"
  | "WALLET_REJECTED"
  | "WALLET_UNSUPPORTED"
  | "WALLET_STALE_SESSION"
  | "WALLET_NETWORK_MISMATCH"
  | "WALLET_SIGNING_FAILED";

export class WalletError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WalletError";
  }
}

type SupportedWallet = {
  id: string;
  name: string;
  isAvailable: boolean;
};

type WalletState = {
  address: string | null;
  walletId: string | null;
  walletName: string | null;
  status: WalletStatus;
  error: string | null;
  errorCode: WalletErrorCode | null;
  supportedWallets: SupportedWallet[];
  staleAddress: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
};

const WalletContext = createContext<WalletState | null>(null);

const LAST_SESSION_KEY = "velo:last-wallet-session";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Wallet request failed";
}

function isRejected(error: unknown) {
  return /reject|denied|cancel/i.test(getErrorMessage(error));
}

function walletName(wallets: SupportedWallet[], walletId: string | null) {
  return wallets.find((wallet) => wallet.id === walletId)?.name ?? walletId;
}

function readStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const storedSession = window.localStorage.getItem(LAST_SESSION_KEY);
  if (!storedSession) {
    return null;
  }

  try {
    return JSON.parse(storedSession) as { address?: string; walletId?: string };
  } catch {
    window.localStorage.removeItem(LAST_SESSION_KEY);
    return null;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<WalletErrorCode | null>(null);
  const [supportedWallets, setSupportedWallets] = useState<SupportedWallet[]>([]);
  const [staleAddress, setStaleAddress] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const unsubscribers: Array<() => void> = [];

    async function initializeWalletsKit() {
      if (typeof window === "undefined") {
        return;
      }

      try {
        const [{ StellarWalletsKit, KitEventType, Networks }, { defaultModules }] =
          await Promise.all([
            import("@creit-tech/stellar-wallets-kit"),
            import("@creit-tech/stellar-wallets-kit/modules/utils"),
          ]);

        StellarWalletsKit.init({
          modules: defaultModules(),
          network: Networks.TESTNET,
          authModal: {
            showInstallLabel: true,
            hideUnsupportedWallets: false,
          },
        });
        StellarWalletsKit.setNetwork(Networks.TESTNET);

        const wallets = await StellarWalletsKit.refreshSupportedWallets();
        if (!isMounted) {
          return;
        }

        setSupportedWallets(
          wallets.map((wallet) => ({
            id: wallet.id,
            name: wallet.name,
            isAvailable: wallet.isAvailable,
          })),
        );

        const storedSession = readStoredSession();
        if (storedSession) {
          setStaleAddress(storedSession.address ?? null);
          setWalletId(storedSession.walletId ?? null);
          setStatus("stale");
          setErrorCode("WALLET_STALE_SESSION");
        } else {
          setStatus("ready");
        }

        unsubscribers.push(
          StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
            setAddress(event.payload.address ?? null);
            setError(null);
            setErrorCode(null);

            if (event.payload.networkPassphrase !== STELLAR_TESTNET_NETWORK_PASSPHRASE) {
              setStatus("unsupported");
              setErrorCode("WALLET_NETWORK_MISMATCH");
              setError(`Switch wallet network to ${stellarConfig.networkLabel}.`);
              return;
            }

            if (event.payload.address) {
              setStatus("connected");
              setStaleAddress(null);
            }
          }),
          StellarWalletsKit.on(KitEventType.WALLET_SELECTED, (event) => {
            setWalletId(event.payload.id ?? null);
          }),
          StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
            setAddress(null);
            setStaleAddress(null);
            setStatus("disconnected");
            setError(null);
            setErrorCode(null);
            window.localStorage.removeItem(LAST_SESSION_KEY);
          }),
        );
      } catch (initError) {
        if (!isMounted) {
          return;
        }

        setStatus("unavailable");
        setErrorCode("WALLET_UNAVAILABLE");
        setError(getErrorMessage(initError));
      }
    }

    initializeWalletsKit();

    return () => {
      isMounted = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !address) {
      return;
    }

    window.localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ address, walletId }));
  }, [address, walletId]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    setStatus("connecting");
    setError(null);
    setErrorCode(null);

    try {
      const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
      const result = await StellarWalletsKit.authModal();
      const selectedWalletId = StellarWalletsKit.selectedModule?.productId ?? walletId;

      setAddress(result.address);
      setWalletId(selectedWalletId);
      setStaleAddress(null);
      setStatus("connected");
      window.localStorage.setItem(
        LAST_SESSION_KEY,
        JSON.stringify({ address: result.address, walletId: selectedWalletId }),
      );
    } catch (connectError) {
      const rejected = isRejected(connectError);
      setStatus(rejected ? "rejected" : "error");
      setErrorCode(rejected ? "WALLET_REJECTED" : "WALLET_UNAVAILABLE");
      setError(getErrorMessage(connectError));
    }
  }, [walletId]);

  const disconnect = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
      await StellarWalletsKit.disconnect();
    } finally {
      setAddress(null);
      setStaleAddress(null);
      setStatus("disconnected");
      setError(null);
      setErrorCode(null);
      window.localStorage.removeItem(LAST_SESSION_KEY);
    }
  }, []);

  const signTransaction = useCallback(
    async (xdr: string) => {
      if (!address) {
        throw new WalletError("WALLET_NOT_CONNECTED", "Connect a wallet before signing.");
      }

      try {
        const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
        const result = await StellarWalletsKit.signTransaction(xdr, {
          networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
          address,
        });
        return result.signedTxXdr;
      } catch (signError) {
        throw new WalletError(
          isRejected(signError) ? "WALLET_REJECTED" : "WALLET_SIGNING_FAILED",
          isRejected(signError)
            ? "Wallet request rejected."
            : "The wallet could not sign this Testnet transaction.",
          { cause: signError },
        );
      }
    },
    [address],
  );

  const signMessage = useCallback(
    async (message: string) => {
      if (!address) {
        throw new Error("Connect a wallet before signing");
      }

      const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit");
      const result = await StellarWalletsKit.signMessage(message, {
        networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
        address,
      });

      return result.signedMessage;
    },
    [address],
  );

  const value = useMemo<WalletState>(
    () => ({
      address,
      walletId,
      walletName: walletName(supportedWallets, walletId),
      status,
      error,
      errorCode,
      supportedWallets,
      staleAddress,
      connect,
      disconnect,
      signTransaction,
      signMessage,
    }),
    [
      address,
      walletId,
      status,
      error,
      errorCode,
      supportedWallets,
      staleAddress,
      connect,
      disconnect,
      signTransaction,
      signMessage,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const wallet = useContext(WalletContext);

  if (!wallet) {
    throw new Error("useWallet must be used inside WalletProvider");
  }

  return wallet;
}
