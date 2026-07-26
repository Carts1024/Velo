import type { MutationCtx, QueryCtx } from "../_generated/server";

export function normalizeWalletAddress(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new Error("Wallet address is required");
  if (!/^G[A-Z0-9]{3,}$/.test(normalized)) throw new Error("Invalid Stellar wallet address");
  return normalized;
}

export async function authenticatedWallet(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return normalizeWalletAddress(identity.subject);
}

export async function isBillingOperator(ctx: QueryCtx | MutationCtx) {
  const walletAddress = await authenticatedWallet(ctx);
  const entry = await ctx.db
    .query("billingOperatorWallets")
    .withIndex("by_wallet_address", (q) => q.eq("walletAddress", walletAddress))
    .unique();
  return entry?.active === true;
}

export async function requireBillingOperator(ctx: QueryCtx | MutationCtx) {
  const walletAddress = await authenticatedWallet(ctx);
  const entry = await ctx.db
    .query("billingOperatorWallets")
    .withIndex("by_wallet_address", (q) => q.eq("walletAddress", walletAddress))
    .unique();
  if (!entry?.active) throw new Error("Billing operator access required");
  return { walletAddress, entry };
}
