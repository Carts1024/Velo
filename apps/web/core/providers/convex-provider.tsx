"use client";

import { useWallet } from "@/core/wallet/wallet-provider";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ReactNode, useCallback, useMemo, useRef } from "react";

import { env } from "../config/env";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL!);

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

function useWalletConvexAuth() {
  const wallet = useWallet();
  const tokenRef = useRef<WalletToken | null>(null);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!wallet.address) {
        tokenRef.current = null;
        return null;
      }

      const cached = tokenRef.current;
      if (
        cached &&
        cached.address === wallet.address &&
        !forceRefreshToken &&
        jwtExpiresAt(cached.token) - Date.now() > 60_000
      ) {
        return cached.token;
      }

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

      return result.token;
    },
    [wallet],
  );

  return useMemo(
    () => ({
      isLoading: wallet.status === "initializing" || wallet.status === "connecting",
      isAuthenticated: wallet.status === "connected" && Boolean(wallet.address),
      fetchAccessToken,
    }),
    [fetchAccessToken, wallet.address, wallet.status],
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useWalletConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
