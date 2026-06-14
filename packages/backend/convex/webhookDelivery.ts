import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { WebhookEventType } from "./webhook_endpoints/types";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";

type DeliveryTarget = {
  endpoint: Doc<"webhookEndpoints">;
  project: Doc<"projects">;
  contractEvent?: Doc<"contractEvents"> | null;
};

function buildPayload(target: DeliveryTarget, eventType: WebhookEventType) {
  const event = target.contractEvent;
  const sentAt = new Date().toISOString();
  const base = {
    id: crypto.randomUUID(),
    type: eventType,
    test: true,
    sentAt,
    project: {
      id: target.project._id,
      registryProjectId: target.project.registryProjectId,
      name: target.project.name,
      slug: target.project.slug,
    },
  };

  if (eventType === "contract.event" && event) {
    return {
      ...base,
      test: false,
      contractId: event.contractId,
      transactionHash: event.transactionHash,
      ledger: event.ledger,
      event: {
        id: event.eventId,
        topic: event.topic,
        type: event.type,
        data: event.decoded ?? event.raw,
        observedAt: event.observedAt,
      },
    };
  }

  if (eventType === "transaction.succeeded" || eventType === "transaction.failed") {
    return {
      ...base,
      transactionHash: event?.transactionHash ?? target.project.registrationTxHash,
      ledger: event?.ledger ?? target.project.createdLedger,
      status: eventType === "transaction.succeeded" ? "success" : "failed",
    };
  }

  return {
    ...base,
    ledger: target.project.createdLedger,
    metadataHash: target.project.metadataHash,
    status: target.project.status,
  };
}

function payloadSummary(payload: ReturnType<typeof buildPayload>) {
  return {
    id: payload.id,
    type: payload.type,
    test: payload.test,
    projectId: payload.project.id,
    ...("contractId" in payload && payload.contractId ? { contractId: payload.contractId } : {}),
    ...("transactionHash" in payload && payload.transactionHash
      ? { transactionHash: payload.transactionHash }
      : {}),
    ...(payload.ledger !== undefined ? { ledger: payload.ledger } : {}),
  };
}

export const sendTest = action({
  args: {
    projectId: v.id("projects"),
    ownerAddress: v.string(),
    eventType: v.union(
      v.literal("contract.event"),
      v.literal("transaction.succeeded"),
      v.literal("transaction.failed"),
      v.literal("project.registered"),
      v.literal("project.updated"),
    ),
    contractEventId: v.optional(v.id("contractEvents")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ deliveryId: Id<"webhookDeliveries">; status: "success" | "failed" }> => {
    const target: DeliveryTarget = await ctx.runQuery(
      internal.webhook_endpoints.query.getDeliveryTarget,
      args,
    );
    const payload = buildPayload(target, args.eventType);
    const deliveryId: Id<"webhookDeliveries"> = await ctx.runMutation(
      internal.webhook_endpoints.mutation.createPendingDelivery,
      {
        projectId: args.projectId,
        endpointId: target.endpoint._id,
        eventType: args.eventType,
        destinationHost: target.endpoint.destinationHost,
        payloadSummary: payloadSummary(payload),
      },
    );

    try {
      const response = await fetch(target.endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "TalaKit-Webhook/1.0",
          "x-talakit-event": args.eventType,
          "x-talakit-delivery": deliveryId,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const status = response.ok ? "success" : "failed";

      await ctx.runMutation(internal.webhook_endpoints.mutation.finishDelivery, {
        deliveryId,
        status,
        httpStatus: response.status,
        errorMessage: response.ok ? undefined : `Endpoint returned HTTP ${response.status}`,
      });

      return { deliveryId, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook request failed";
      await ctx.runMutation(internal.webhook_endpoints.mutation.finishDelivery, {
        deliveryId,
        status: "failed",
        errorMessage: message,
      });
      return { deliveryId, status: "failed" };
    }
  },
});
