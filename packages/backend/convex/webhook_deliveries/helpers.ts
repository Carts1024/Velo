export const DEFAULT_DELIVERY_LIMIT = 25;
export const MAX_DELIVERY_LIMIT = 100;

export function normalizeDeliveryLimit(limit?: number) {
  return Math.min(MAX_DELIVERY_LIMIT, Math.max(1, limit ?? DEFAULT_DELIVERY_LIMIT));
}
