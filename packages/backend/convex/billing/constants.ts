export const BILLING_CALCULATION_VERSION = 1;
export const PROMOTIONAL_CREDITS = 100n;
export const PROMOTIONAL_VALIDITY_MS = 60 * 24 * 60 * 60_000;
export const RESERVATION_TTL_MS = 30 * 60_000;

export const DEFAULT_BILLING_POLICY = {
  key: "global" as const,
  version: 1,
  billingLedgerWrite: false,
  billingShadowMode: false,
  mainnetCreditEnforcement: false,
  billingTopupsEnabled: false,
  promoGrantEnabled: false,
  pdaxBillingEnabled: false,
  billingKillSwitch: true,
  promoCredits: PROMOTIONAL_CREDITS,
  promoValidityMs: PROMOTIONAL_VALIDITY_MS,
  reservationTtlMs: RESERVATION_TTL_MS,
  promoFirst: true,
};
