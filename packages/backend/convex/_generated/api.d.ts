/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as contractEventPolling from "../contractEventPolling.js";
import type * as contract_events_helpers from "../contract_events/helpers.js";
import type * as contract_events_mutation from "../contract_events/mutation.js";
import type * as contract_events_query from "../contract_events/query.js";
import type * as contract_events_types from "../contract_events/types.js";
import type * as crons from "../crons.js";
import type * as project_contracts_helpers from "../project_contracts/helpers.js";
import type * as project_contracts_mutation from "../project_contracts/mutation.js";
import type * as project_contracts_query from "../project_contracts/query.js";
import type * as project_contracts_types from "../project_contracts/types.js";
import type * as projects_helpers from "../projects/helpers.js";
import type * as projects_mutation from "../projects/mutation.js";
import type * as projects_query from "../projects/query.js";
import type * as projects_types from "../projects/types.js";
import type * as tasks from "../tasks.js";
import type * as transactions from "../transactions.js";
import type * as webhookDelivery from "../webhookDelivery.js";
import type * as webhook_deliveries_helpers from "../webhook_deliveries/helpers.js";
import type * as webhook_deliveries_mutation from "../webhook_deliveries/mutation.js";
import type * as webhook_deliveries_query from "../webhook_deliveries/query.js";
import type * as webhook_deliveries_types from "../webhook_deliveries/types.js";
import type * as webhook_endpoints_helpers from "../webhook_endpoints/helpers.js";
import type * as webhook_endpoints_mutation from "../webhook_endpoints/mutation.js";
import type * as webhook_endpoints_query from "../webhook_endpoints/query.js";
import type * as webhook_endpoints_types from "../webhook_endpoints/types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  contractEventPolling: typeof contractEventPolling;
  "contract_events/helpers": typeof contract_events_helpers;
  "contract_events/mutation": typeof contract_events_mutation;
  "contract_events/query": typeof contract_events_query;
  "contract_events/types": typeof contract_events_types;
  crons: typeof crons;
  "project_contracts/helpers": typeof project_contracts_helpers;
  "project_contracts/mutation": typeof project_contracts_mutation;
  "project_contracts/query": typeof project_contracts_query;
  "project_contracts/types": typeof project_contracts_types;
  "projects/helpers": typeof projects_helpers;
  "projects/mutation": typeof projects_mutation;
  "projects/query": typeof projects_query;
  "projects/types": typeof projects_types;
  tasks: typeof tasks;
  transactions: typeof transactions;
  webhookDelivery: typeof webhookDelivery;
  "webhook_deliveries/helpers": typeof webhook_deliveries_helpers;
  "webhook_deliveries/mutation": typeof webhook_deliveries_mutation;
  "webhook_deliveries/query": typeof webhook_deliveries_query;
  "webhook_deliveries/types": typeof webhook_deliveries_types;
  "webhook_endpoints/helpers": typeof webhook_endpoints_helpers;
  "webhook_endpoints/mutation": typeof webhook_endpoints_mutation;
  "webhook_endpoints/query": typeof webhook_endpoints_query;
  "webhook_endpoints/types": typeof webhook_endpoints_types;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
