export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_SCHEDULED_CONTRACTS = 100;
export const MAX_SCHEDULED_PROJECTS = 20;

export const METADATA_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export function normalizeOwnerAddress(address: string) {
  return address.trim().toUpperCase();
}

export function normalizePageSize(limit?: number) {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, limit ?? DEFAULT_PAGE_SIZE));
}
