"use client";

import { api } from "@repo/backend/convex/_generated/api";
import { useQuery, useConvexAuth } from "convex/react";

export function useUserProfile(walletAddress: string | null) {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(
    api.users.query.getByWallet,
    walletAddress && isAuthenticated ? {} : "skip",
  );

  const isLoading = walletAddress !== null && isAuthenticated && user === undefined;
  const isNewUser = walletAddress !== null && isAuthenticated && user === null;

  return { user: user ?? null, isLoading, isNewUser };
}
