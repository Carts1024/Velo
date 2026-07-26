import { defineTable } from "convex/server";
import { v } from "convex/values";

export const billingBookValidator = v.union(v.literal("shadow"), v.literal("commercial"));
export const creditClassValidator = v.union(v.literal("promotional"), v.literal("paid"));
export const billingNetworkValidator = v.union(v.literal("testnet"), v.literal("public"));
export const billingEnvironmentValidator = v.union(
  v.literal("development"),
  v.literal("preview"),
  v.literal("production"),
);

export const billingPolicies = defineTable({
  key: v.literal("global"),
  version: v.number(),
  billingLedgerWrite: v.boolean(),
  billingShadowMode: v.boolean(),
  mainnetCreditEnforcement: v.boolean(),
  billingTopupsEnabled: v.boolean(),
  promoGrantEnabled: v.boolean(),
  pdaxBillingEnabled: v.boolean(),
  billingKillSwitch: v.boolean(),
  promoCredits: v.int64(),
  promoValidityMs: v.number(),
  reservationTtlMs: v.number(),
  promoFirst: v.boolean(),
  updatedBy: v.string(),
  updatedAt: v.number(),
}).index("by_key", ["key"]);

export const organizationBillingSettings = defineTable({
  organizationId: v.id("organizations"),
  enforcementEnabled: v.boolean(),
  shadowEnabled: v.boolean(),
  sandboxEnforcementEnabled: v.optional(v.boolean()),
  updatedBy: v.string(),
  updatedAt: v.number(),
}).index("by_organization_id", ["organizationId"]);

export const billingOffers = defineTable({
  sku: v.string(),
  version: v.number(),
  creditQuantity: v.int64(),
  priceAmount: v.string(),
  asset: v.string(),
  network: billingNetworkValidator,
  treasuryAddress: v.string(),
  refundPolicy: v.string(),
  active: v.boolean(),
  activeFrom: v.number(),
  activeUntil: v.optional(v.number()),
  createdBy: v.string(),
  createdAt: v.number(),
})
  .index("by_sku_and_version", ["sku", "version"])
  .index("by_active_and_active_from", ["active", "activeFrom"]);

export const billingOperatorWallets = defineTable({
  walletAddress: v.string(),
  active: v.boolean(),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.string(),
  updatedAt: v.number(),
}).index("by_wallet_address", ["walletAddress"]);

export const billingTopups = defineTable({
  organizationId: v.id("organizations"),
  projectId: v.id("projects"),
  paymentIntentId: v.optional(v.id("paymentIntents")),
  offerId: v.id("billingOffers"),
  sku: v.string(),
  offerVersion: v.number(),
  creditQuantity: v.int64(),
  priceAmount: v.string(),
  asset: v.string(),
  network: billingNetworkValidator,
  treasuryAddress: v.string(),
  refundPolicy: v.string(),
  status: v.union(
    v.literal("created"),
    v.literal("pending"),
    v.literal("settled"),
    v.literal("failed"),
    v.literal("cancelled"),
    v.literal("expired"),
    v.literal("exception"),
  ),
  payerAddress: v.optional(v.string()),
  transactionHash: v.optional(v.string()),
  treasuryReceiptId: v.optional(v.id("treasuryReceipts")),
  createdAt: v.number(),
  updatedAt: v.number(),
  settledAt: v.optional(v.number()),
})
  .index("by_organization_id_and_created_at", ["organizationId", "createdAt"])
  .index("by_payment_intent_id", ["paymentIntentId"])
  .index("by_transaction_hash", ["transactionHash"])
  .index("by_status_and_updated_at", ["status", "updatedAt"]);

export const treasuryReceipts = defineTable({
  organizationId: v.id("organizations"),
  topupId: v.id("billingTopups"),
  paymentIntentId: v.id("paymentIntents"),
  offerId: v.id("billingOffers"),
  transactionHash: v.string(),
  sourceAddress: v.string(),
  destinationAddress: v.string(),
  amount: v.string(),
  asset: v.string(),
  network: billingNetworkValidator,
  sku: v.string(),
  offerVersion: v.number(),
  creditQuantity: v.int64(),
  priceAmount: v.string(),
  refundPolicy: v.string(),
  verifiedAt: v.number(),
})
  .index("by_organization_id_and_verified_at", ["organizationId", "verifiedAt"])
  .index("by_topup_id", ["topupId"])
  .index("by_payment_intent_id", ["paymentIntentId"])
  .index("by_transaction_hash", ["transactionHash"]);

export const billingExceptions = defineTable({
  organizationId: v.optional(v.id("organizations")),
  exceptionType: v.union(
    v.literal("topup_mismatch"),
    v.literal("reused_transaction"),
    v.literal("reservation_mismatch"),
    v.literal("ledger_mismatch"),
    v.literal("receipt_mismatch"),
    v.literal("verification_ambiguous"),
  ),
  status: v.union(v.literal("open"), v.literal("resolved")),
  dedupeKey: v.string(),
  summary: v.string(),
  evidenceJson: v.string(),
  paymentIntentId: v.optional(v.id("paymentIntents")),
  reservationId: v.optional(v.id("creditReservations")),
  topupId: v.optional(v.id("billingTopups")),
  treasuryReceiptId: v.optional(v.id("treasuryReceipts")),
  resolutionAction: v.optional(
    v.union(
      v.literal("acknowledge"),
      v.literal("retry_verification"),
      v.literal("compensating_adjustment"),
    ),
  ),
  resolutionNote: v.optional(v.string()),
  resolutionLedgerEntryId: v.optional(v.id("billingLedgerEntries")),
  resolvedBy: v.optional(v.string()),
  resolvedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_dedupe_key", ["dedupeKey"])
  .index("by_status_and_created_at", ["status", "createdAt"])
  .index("by_organization_id_and_created_at", ["organizationId", "createdAt"]);

export const billingNotifications = defineTable({
  organizationId: v.id("organizations"),
  notificationType: v.union(
    v.literal("low_balance"),
    v.literal("zero_balance"),
    v.literal("promotional_expiry"),
    v.literal("reservation_recovery"),
    v.literal("topup_success"),
    v.literal("topup_failure"),
  ),
  dedupeKey: v.string(),
  title: v.string(),
  message: v.string(),
  topupId: v.optional(v.id("billingTopups")),
  paymentIntentId: v.optional(v.id("paymentIntents")),
  reservationId: v.optional(v.id("creditReservations")),
  readAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_organization_id_and_created_at", ["organizationId", "createdAt"]);

export const billingBalances = defineTable({
  organizationId: v.id("organizations"),
  book: billingBookValidator,
  promoAvailable: v.int64(),
  promoReserved: v.int64(),
  promoConsumed: v.int64(),
  promoExpired: v.int64(),
  paidAvailable: v.int64(),
  paidReserved: v.int64(),
  paidConsumed: v.int64(),
  paidExpired: v.int64(),
  version: v.number(),
  updatedAt: v.number(),
}).index("by_organization_id_and_book", ["organizationId", "book"]);

export const creditLots = defineTable({
  organizationId: v.id("organizations"),
  book: billingBookValidator,
  creditClass: creditClassValidator,
  sourceLedgerEntryId: v.id("billingLedgerEntries"),
  granted: v.int64(),
  available: v.int64(),
  reserved: v.int64(),
  consumed: v.int64(),
  expired: v.int64(),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_organization_id_and_book_and_credit_class", ["organizationId", "book", "creditClass"])
  .index("by_organization_id_and_book_and_credit_class_and_expires_at", [
    "organizationId",
    "book",
    "creditClass",
    "expiresAt",
  ])
  .index("by_expires_at", ["expiresAt"]);

export const billingLedgerEntries = defineTable({
  organizationId: v.id("organizations"),
  book: billingBookValidator,
  creditClass: creditClassValidator,
  entryType: v.union(
    v.literal("promo_grant"),
    v.literal("paid_grant"),
    v.literal("reserve"),
    v.literal("consume"),
    v.literal("release"),
    v.literal("expiry"),
    v.literal("adjustment"),
    v.literal("refund_adjustment"),
  ),
  amount: v.int64(),
  idempotencyKey: v.string(),
  projectId: v.optional(v.id("projects")),
  paymentIntentId: v.optional(v.id("paymentIntents")),
  reservationId: v.optional(v.id("creditReservations")),
  creditLotId: v.optional(v.id("creditLots")),
  topupReference: v.optional(v.string()),
  treasuryReceiptReference: v.optional(v.string()),
  actor: v.string(),
  reason: v.string(),
  environment: billingEnvironmentValidator,
  network: billingNetworkValidator,
  calculationVersion: v.number(),
  occurredAt: v.number(),
})
  .index("by_organization_id_and_book", ["organizationId", "book"])
  .index("by_organization_id_and_book_and_idempotency_key", [
    "organizationId",
    "book",
    "idempotencyKey",
  ])
  .index("by_payment_intent_id", ["paymentIntentId"])
  .index("by_reservation_id", ["reservationId"]);

export const creditReservations = defineTable({
  organizationId: v.id("organizations"),
  projectId: v.id("projects"),
  paymentIntentId: v.optional(v.id("paymentIntents")),
  book: billingBookValidator,
  network: billingNetworkValidator,
  creditClass: creditClassValidator,
  creditLotId: v.id("creditLots"),
  amount: v.int64(),
  status: v.union(
    v.literal("active"),
    v.literal("consumed"),
    v.literal("released"),
    v.literal("expired"),
  ),
  reserveIdempotencyKey: v.string(),
  terminalIdempotencyKey: v.optional(v.string()),
  expiresAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_organization_id_and_book_and_status", ["organizationId", "book", "status"])
  .index("by_payment_intent_id", ["paymentIntentId"])
  .index("by_status_and_expires_at", ["status", "expiresAt"])
  .index("by_organization_id_and_book_and_reserve_idempotency_key", [
    "organizationId",
    "book",
    "reserveIdempotencyKey",
  ]);

export const shadowBillingDecisions = defineTable({
  organizationId: v.optional(v.id("organizations")),
  projectId: v.id("projects"),
  paymentIntentId: v.optional(v.id("paymentIntents")),
  reservationId: v.optional(v.id("creditReservations")),
  phase: v.union(
    v.literal("would_reserve"),
    v.literal("would_consume"),
    v.literal("would_release"),
  ),
  outcome: v.union(
    v.literal("applied"),
    v.literal("fee_exempt"),
    v.literal("insufficient_balance"),
    v.literal("unmatched_success"),
    v.literal("disabled"),
    v.literal("error"),
  ),
  reason: v.string(),
  route: v.union(v.literal("stellar"), v.literal("pdax")),
  network: billingNetworkValidator,
  idempotencyKey: v.string(),
  legacyCheckoutCredits: v.optional(v.number()),
  correlationId: v.optional(v.string()),
  transactionHash: v.optional(v.string()),
  settlementTransactionId: v.optional(v.id("settlementTransactions")),
  quotedCost: v.optional(v.string()),
  actualCost: v.optional(v.string()),
  spread: v.optional(v.string()),
  failureCost: v.optional(v.string()),
  subsidy: v.optional(v.string()),
  costCurrency: v.optional(v.string()),
  rawCostInputsJson: v.optional(v.string()),
  calculationVersion: v.number(),
  createdAt: v.number(),
})
  .index("by_idempotency_key", ["idempotencyKey"])
  .index("by_project_id_and_created_at", ["projectId", "createdAt"])
  .index("by_organization_id_and_created_at", ["organizationId", "createdAt"])
  .index("by_payment_intent_id", ["paymentIntentId"]);

export const organizationMigrationCollisions = defineTable({
  ownerAddress: v.string(),
  tokenIdentifiers: v.array(v.string()),
  projectIds: v.array(v.id("projects")),
  reason: v.string(),
  detectedAt: v.number(),
}).index("by_owner_address", ["ownerAddress"]);
