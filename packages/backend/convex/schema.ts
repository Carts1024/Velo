import { defineSchema } from "convex/server";

import apiKeys from "./api_keys/schema";
import contractEvents from "./contract_events/schema";
import feedback from "./feedback/schema";
import journeyStages from "./journey_stages/schema";
import paymentIntentIdempotencyKeys from "./payment_intent_idempotency_keys/schema";
import paymentIntentRouteJobs from "./payment_intent_route_jobs/schema";
import paymentIntents from "./payment_intents/schema";
import paymentReconciliationJobs from "./payment_reconciliation_jobs/schema";
import pdaxRouteCache from "./pdax_route_cache/schema";
import pollerState from "./poller_state/schema";
import projectContracts from "./project_contracts/schema";
import projects from "./projects/schema";
import providerConnections from "./provider_connections/schema";
import providerEvents from "./provider_events/schema";
import providerOperations from "./provider_operations/schema";
import providerResilience from "./provider_resilience/schema";
import rateLimitBuckets from "./rate_limit_buckets/schema";
import settlementQuotes from "./settlement_quotes/schema";
import settlementTransactions from "./settlement_transactions/schema";
import telemetryOutbox from "./telemetry_outbox/schema";
import transactions from "./transactions/schema";
import users from "./users/schema";
import webhookDeliveries from "./webhook_deliveries/schema";
import webhookDomainEvents from "./webhook_domain_events/schema";
import webhookEndpoints from "./webhook_endpoints/schema";

export default defineSchema({
  apiKeys,
  contractEvents,
  feedback,
  journeyStages,
  paymentIntentIdempotencyKeys,
  paymentIntentRouteJobs,
  paymentReconciliationJobs,
  paymentIntents,
  pdaxRouteCache,
  pollerState,
  projectContracts,
  projects,
  transactions,
  users,
  webhookDeliveries,
  webhookEndpoints,
  providerConnections,
  providerResilience,
  settlementQuotes,
  settlementTransactions,
  telemetryOutbox,
  providerEvents,
  providerOperations,
  rateLimitBuckets,
  webhookDomainEvents,
});
