import { assertValidContractId } from "./validation.ts";

type NullableContractId = string | null;

export type ContractConfig = {
  registryContractId: NullableContractId;
  payAccessContractId: NullableContractId;
};

export type PublicContractConfigInput = {
  registryContractId?: string | null;
  payAccessContractId?: string | null;
};

export type BackendPayAccessContractConfigInput = {
  payAccessContractId?: string | null;
  publicPayAccessContractId?: string | null;
};

export function normalizeOptionalContractId(value: string | null | undefined, name: string) {
  const raw = value?.trim();

  if (!raw) {
    return null;
  }

  try {
    return assertValidContractId(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stellar contract ID";
    throw new Error(`${name} must be a valid Stellar contract ID: ${message}`);
  }
}

export function resolvePublicContractConfig(input: PublicContractConfigInput): ContractConfig {
  return {
    registryContractId: normalizeOptionalContractId(
      input.registryContractId,
      "NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID",
    ),
    payAccessContractId: normalizeOptionalContractId(
      input.payAccessContractId,
      "NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID",
    ),
  };
}

export function requirePublicContractConfig(input: PublicContractConfigInput): {
  registryContractId: string;
  payAccessContractId: string;
} {
  const config = resolvePublicContractConfig(input);
  const missing = [];

  if (!config.registryContractId) {
    missing.push("NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID");
  }
  if (!config.payAccessContractId) {
    missing.push("NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required hosted contract ID env vars: ${missing.join(", ")}`);
  }

  const registryContractId = config.registryContractId;
  const payAccessContractId = config.payAccessContractId;

  if (!registryContractId || !payAccessContractId) {
    throw new Error("Missing required hosted contract ID env vars");
  }

  return {
    registryContractId,
    payAccessContractId,
  };
}

export function resolveBackendPayAccessContractId(input: BackendPayAccessContractConfigInput) {
  const preferred = normalizeOptionalContractId(
    input.payAccessContractId,
    "VELO_PAY_ACCESS_CONTRACT_ID",
  );

  if (preferred) {
    return preferred;
  }

  const fallback = normalizeOptionalContractId(
    input.publicPayAccessContractId,
    "NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID",
  );

  if (fallback) {
    return fallback;
  }

  throw new Error(
    "Missing VELO_PAY_ACCESS_CONTRACT_ID for pay-access sync. Set the Convex env var to the deployed VeloPayAccess contract ID.",
  );
}
