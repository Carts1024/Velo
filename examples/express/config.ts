export type CheckoutAnchor = "inhouse" | "pdax";

type AnchorApiKeyEnvironment = {
  VELO_INHOUSE_API_KEY?: string;
  VELO_PDAX_API_KEY?: string;
};

export function isCheckoutAnchor(value: unknown): value is CheckoutAnchor {
  return value === "inhouse" || value === "pdax";
}

export function requireApiKeyForAnchor(
  anchor: CheckoutAnchor,
  env: AnchorApiKeyEnvironment = {
    VELO_INHOUSE_API_KEY: process.env.VELO_INHOUSE_API_KEY,
    VELO_PDAX_API_KEY: process.env.VELO_PDAX_API_KEY,
  },
) {
  const inhouseApiKey = env.VELO_INHOUSE_API_KEY?.trim();
  const pdaxApiKey = env.VELO_PDAX_API_KEY?.trim();

  if (inhouseApiKey && pdaxApiKey && inhouseApiKey === pdaxApiKey) {
    throw new Error("VELO_INHOUSE_API_KEY and VELO_PDAX_API_KEY must use different API keys.");
  }

  const variableName = anchor === "inhouse" ? "VELO_INHOUSE_API_KEY" : "VELO_PDAX_API_KEY";
  const apiKey = anchor === "inhouse" ? inhouseApiKey : pdaxApiKey;

  if (!apiKey) {
    throw new Error(`${variableName} is required for ${anchor} checkout.`);
  }

  return apiKey;
}
