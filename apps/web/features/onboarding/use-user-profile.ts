"use client";

import { api } from "@repo/backend/convex/_generated/api";
import { useQuery } from "convex/react";

export function useUserProfile(walletAddress: string | null) {
  const user = useQuery(api.users.query.getByWallet, walletAddress ? {} : "skip");

  const isLoading = walletAddress !== null && user === undefined;
  const isNewUser = walletAddress !== null && user === null;

  return { user: user ?? null, isLoading, isNewUser };
}
