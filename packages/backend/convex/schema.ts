import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import apiKeys from "./api_keys/schema";
import contractEvents from "./contract_events/schema";
import feedback from "./feedback/schema";
import paymentIntentIdempotencyKeys from "./payment_intent_idempotency_keys/schema";
import paymentIntents from "./payment_intents/schema";
import pollerState from "./poller_state/schema";
import projectContracts from "./project_contracts/schema";
import projects from "./projects/schema";
import providerConnections from "./provider_connections/schema";
import providerEvents from "./provider_events/schema";
import settlementQuotes from "./settlement_quotes/schema";
import settlementTransactions from "./settlement_transactions/schema";
import transactions from "./transactions/schema";
import users from "./users/schema";
import webhookDeliveries from "./webhook_deliveries/schema";
import webhookEndpoints from "./webhook_endpoints/schema";

export default defineSchema({
  apiKeys,
  contractEvents,
  feedback,
  paymentIntentIdempotencyKeys,
  paymentIntents,
  pollerState,
  projectContracts,
  projects,
  transactions,
  users,
  webhookDeliveries,
  webhookEndpoints,
  providerConnections,
  settlementQuotes,
  settlementTransactions,
  providerEvents,
  tasks: defineTable({
    todo: v.string(),
    completed: v.boolean(),
    createdAt: v.number(), // Unix timestamp
    updatedAt: v.number(),
  }).index("by_completed", ["completed"]),
});
