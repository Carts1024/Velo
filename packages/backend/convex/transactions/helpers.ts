export const CACHE_TTL_MS = 5 * 60 * 1_000;
export const DEFAULT_TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";

const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export function normalizeHash(hash: string) {
  const normalized = hash.trim().toLowerCase();

  if (!TRANSACTION_HASH_PATTERN.test(normalized)) {
    throw new Error("Transaction hash must be a 64-character hexadecimal value");
  }

  return normalized;
}

export function normalizeCreatedAt(value: unknown) {
  if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) {
    return undefined;
  }

  const createdAt = typeof value === "number" ? value : Number(value);
  return Number.isFinite(createdAt) ? createdAt : undefined;
}

export function testnetRpcUrl() {
  return (
    process.env.STELLAR_RPC_URL ??
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
    DEFAULT_TESTNET_RPC_URL
  );
}
