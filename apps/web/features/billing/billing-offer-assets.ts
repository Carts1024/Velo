export type BillingOfferAsset = "USDC" | "XLM";

export function resolveBillingOfferAsset(
  selection: string,
  configuredUsdcIssuer: string | undefined,
) {
  if (selection === "XLM") return "native";
  if (selection !== "USDC") throw new Error("Choose USDC or XLM for the billing offer");

  const issuer = configuredUsdcIssuer
    ?.trim()
    .toUpperCase()
    .replace(/^USDC:/, "");
  if (!issuer) {
    throw new Error("NEXT_PUBLIC_USDC_ISSUER must be configured to activate a USDC offer");
  }
  return `USDC:${issuer}`;
}

export function formatBillingOfferAsset(asset: string) {
  return asset.trim().toLowerCase() === "native" ? "XLM" : asset.split(":")[0];
}
