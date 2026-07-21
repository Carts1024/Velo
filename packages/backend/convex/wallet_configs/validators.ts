import { v } from "convex/values";

export const walletDraftArgs = {
  projectId: v.id("projects"),
  network: v.union(v.literal("testnet"), v.literal("public")),
  walletIds: v.array(v.string()),
  theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
  buttonLabel: v.string(),
  showInstallLabel: v.boolean(),
  hideUnsupportedWallets: v.boolean(),
  persistSession: v.boolean(),
  allowedOrigins: v.array(v.string()),
};
