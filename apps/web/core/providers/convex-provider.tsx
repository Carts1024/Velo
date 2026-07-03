"use client";

import { useWallet } from "@/core/wallet/wallet-provider";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { usePathname } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useRef } from "react";

import { env } from "../config/env";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL!);
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

type WalletToken = {
  token: string;
  address: string;
};

function jwtExpiresAt(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    return 0;
  }

  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };
    return claims.exp ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function readStoredConvexToken(): WalletToken | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.sessionStorage.getItem("velo:convex-token");
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as WalletToken;
  } catch {
    window.sessionStorage.removeItem("velo:convex-token");
    return null;
  }
}

function writeStoredConvexToken(token: WalletToken | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    window.sessionStorage.setItem("velo:convex-token", JSON.stringify(token));
  } else {
    window.sessionStorage.removeItem("velo:convex-token");
  }
}

function validTokenForWallet(
  token: WalletToken | null,
  address: string | null,
): token is WalletToken {
  if (!token || !address || token.address !== address) {
    return false;
  }

  return jwtExpiresAt(token.token) - Date.now() > TOKEN_REFRESH_MARGIN_MS;
}

function isPublicRoute(path: string) {
  return (
    path === "/" ||
    path.startsWith("/docs") ||
    path.startsWith("/verify") ||
    path.startsWith("/pay")
  );
}

function useWalletConvexAuth() {
  const wallet = useWallet();
  const tokenRef = useRef<WalletToken | null>(null);
  const pendingPromiseRef = useRef<Promise<string | null> | null>(null);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Clear token if explicitly disconnected or rejected
  useEffect(() => {
    if (wallet.status === "disconnected" || wallet.status === "rejected") {
      tokenRef.current = null;
      pendingPromiseRef.current = null;
      writeStoredConvexToken(null);
    }
  }, [wallet.status]);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (wallet.status === "initializing" || wallet.status === "connecting") {
        return null;
      }

      if (!wallet.address) {
        tokenRef.current = null;
        pendingPromiseRef.current = null;
        return null;
      }

      const cached = tokenRef.current || readStoredConvexToken();
      if (validTokenForWallet(cached, wallet.address)) {
        tokenRef.current = cached;
        return cached.token;
      }

      if (isPublicRoute(pathnameRef.current) && !forceRefreshToken) {
        return null;
      }

      if (pendingPromiseRef.current) {
        return pendingPromiseRef.current;
      }

      const fetchPromise = (async () => {
        try {
          const challengeResponse = await fetch("/api/auth/wallet/challenge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address: wallet.address }),
          });
          if (!challengeResponse.ok) {
            throw new Error("Unable to create wallet auth challenge");
          }
          const challenge = (await challengeResponse.json()) as {
            challenge: string;
            message: string;
          };
          const signature = await wallet.signMessage(challenge.message);
          const verifyResponse = await fetch("/api/auth/wallet/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              address: wallet.address,
              challenge: challenge.challenge,
              message: challenge.message,
              signature,
            }),
          });
          if (!verifyResponse.ok) {
            const errorBody = (await verifyResponse.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(errorBody?.error ?? "Unable to verify wallet auth signature");
          }
          const result = (await verifyResponse.json()) as { token: string; address: string };
          tokenRef.current = result;
          writeStoredConvexToken(result);
          return result.token;
        } catch {
          writeStoredConvexToken(null);
          wallet.disconnect();
          return null;
        } finally {
          pendingPromiseRef.current = null;
        }
      })();

      pendingPromiseRef.current = fetchPromise;
      return fetchPromise;
    },
    [wallet],
  );

  return useMemo(
    () => ({
      isLoading: wallet.status === "initializing" || wallet.status === "connecting",
      isAuthenticated:
        wallet.status === "connected" && Boolean(wallet.address) && !isPublicRoute(pathname),
      fetchAccessToken,
    }),
    [fetchAccessToken, wallet.address, wallet.status, pathname],
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useWalletConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
