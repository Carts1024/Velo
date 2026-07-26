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
  updatedBy: v.string(),
  updatedAt: v.number(),
}).index("by_organization_id", ["organizationId"]);

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
