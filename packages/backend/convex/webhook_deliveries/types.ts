import type { Doc, Id } from "../_generated/dataModel";

export type WebhookDelivery = Doc<"webhookDeliveries">;
export type WebhookDeliveryId = Id<"webhookDeliveries">;
export type WebhookDeliveryStatus = WebhookDelivery["status"];

export type PendingWebhookDeliveryInput = Pick<
  WebhookDelivery,
  "projectId" | "endpointId" | "eventType" | "destinationHost" | "payloadSummary"
>;
