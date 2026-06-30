import type { Doc, Id } from "../_generated/dataModel";

export const WEBHOOK_EVENT_TYPES = [
  "contract.event",
  "transaction.succeeded",
  "transaction.failed",
  "project.registered",
  "project.updated",
  "payment.created",
  "payment.succeeded",
  "payment.failed",
  "payment_access.activated",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
export type WebhookEndpoint = Doc<"webhookEndpoints">;
export type WebhookEndpointId = Id<"webhookEndpoints">;

export type WebhookSettingsInput = Pick<
  WebhookEndpoint,
  "projectId" | "url" | "enabled" | "eventTypes"
>;
