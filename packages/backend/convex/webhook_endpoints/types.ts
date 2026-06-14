import type { Doc, Id } from "../_generated/dataModel";

export const WEBHOOK_EVENT_TYPES = [
  "contract.event",
  "transaction.succeeded",
  "transaction.failed",
  "project.registered",
  "project.updated",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
export type WebhookEndpoint = Doc<"webhookEndpoints">;
export type WebhookDelivery = Doc<"webhookDeliveries">;
export type WebhookEndpointId = Id<"webhookEndpoints">;
export type WebhookDeliveryId = Id<"webhookDeliveries">;

export type WebhookSettingsInput = Pick<
  WebhookEndpoint,
  "projectId" | "url" | "enabled" | "eventTypes"
>;
