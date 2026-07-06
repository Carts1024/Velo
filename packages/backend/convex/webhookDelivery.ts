"use node";

import crypto from "crypto";

import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { WebhookDeliveryId } from "./webhook_deliveries/types";
import type { WebhookEventType } from "./webhook_endpoints/types";

import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { requireIdentity } from "./projects/helpers";

type DeliveryTarget = {
  endpoint: Doc<"webhookEndpoints">;
  project: Doc<"projects">;
  contractEvent?: Doc<"contractEvents"> | null;
  paymentIntent?: Doc<"paymentIntents"> | null;
};

function buildPayload(
  target: DeliveryTarget,
  eventType: WebhookEventType,
  test = false,
  overrideEventId?: string,
) {
  const event = target.contractEvent;
  const paymentIntent = target.paymentIntent;
  const sentAt = new Date().toISOString();
  const base = {
    id: overrideEventId ?? crypto.randomUUID(),
    type: eventType,
    test,
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

  // Handle payment and activation events
  if (eventType.startsWith("payment.") || eventType === "payment_access.activated") {
    const pi = (paymentIntent ?? {
      _id: "pi_mock1234567890",
      amount: "100.00",
      asset: "USDC",
      receiverAddress: target.project.ownerAddress,
      merchantName: target.project.name,
      description: "Mock test payment",
      status:
        eventType === "payment.succeeded"
          ? "paid"
          : eventType === "payment.failed"
            ? "failed"
            : "created",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }) as Record<string, unknown>;
    return {
      ...base,
      paymentIntent: {
        id: pi._id as string,
        amount: (pi.amount as string) ?? "0",
        asset: (pi.asset as string) ?? "native",
        receiverAddress: (pi.receiverAddress as string) ?? "",
        merchantName: (pi.merchantName as string) ?? "",
        description: pi.description as string | undefined,
        status: pi.status as Doc<"paymentIntents">["status"],
        payerAddress: pi.payerAddress as string | undefined,
        txHash: pi.txHash as string | undefined,
        createdAt: new Date((pi.createdAt as number) ?? Date.now()).toISOString(),
        updatedAt: new Date((pi.updatedAt as number) ?? Date.now()).toISOString(),
      },
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
  const p = payload as Record<string, unknown>;
  const pi = p.paymentIntent as Record<string, unknown> | undefined;
  return {
    id: p.id as string,
    type: p.type as WebhookEventType,
    test: p.test as boolean,
    projectId: (p.project as { id: string }).id,
    ...(p.contractId ? { contractId: p.contractId as string } : {}),
    ...(p.transactionHash ? { transactionHash: p.transactionHash as string } : {}),
    ...(p.ledger !== undefined ? { ledger: p.ledger as number } : {}),
    ...(pi ? { paymentIntentId: pi.id as string } : {}),
  };
}

function computeSignatureHeader(payload: unknown, secret?: string): string | undefined {
  if (!secret) {
    return undefined;
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = `${timestamp}.${JSON.stringify(payload)}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signaturePayload);
  const hash = hmac.digest("hex");
  return `t=${timestamp},v1=${hash}`;
}

export const sendTest = action({
  args: {
    projectId: v.id("projects"),
    eventType: v.union(
      v.literal("contract.event"),
      v.literal("transaction.succeeded"),
      v.literal("transaction.failed"),
      v.literal("project.registered"),
      v.literal("project.updated"),
      v.literal("payment.created"),
      v.literal("payment.succeeded"),
      v.literal("payment.failed"),
      v.literal("payment_access.activated"),
    ),
    contractEventId: v.optional(v.id("contractEvents")),
    paymentIntentId: v.optional(v.id("paymentIntents")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ deliveryId: WebhookDeliveryId; status: "success" | "failed" }> => {
    const identity = await requireIdentity(ctx);
    const target: DeliveryTarget = await ctx.runQuery(
      internal.webhook_endpoints.query.getDeliveryTarget,
      {
        ...args,
        ownerTokenIdentifier: identity.tokenIdentifier,
        ownerSubject: identity.subject,
      },
    );
    const payload = buildPayload(target, args.eventType, true);
    const signatureHeader = computeSignatureHeader(payload, target.endpoint.signingSecret);
    const deliveryId: WebhookDeliveryId = await ctx.runMutation(
      internal.webhook_deliveries.mutation.createPending,
      {
        projectId: args.projectId,
        endpointId: target.endpoint._id,
        eventType: args.eventType,
        destinationHost: target.endpoint.destinationHost,
        payloadSummary: payloadSummary(payload),
        paymentIntentId: args.paymentIntentId,
      },
    );

    const startTime = Date.now();
    try {
      const response = await fetch(target.endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Velo-Webhook/1.0",
          "x-velo-event": args.eventType,
          "x-velo-delivery": deliveryId,
          ...(signatureHeader ? { "x-velo-signature": signatureHeader } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const responseTimeMs = Date.now() - startTime;
      const status = response.ok ? "success" : "failed";

      await ctx.runMutation(internal.webhook_deliveries.mutation.finish, {
        deliveryId,
        status,
        httpStatus: response.status,
        errorMessage: response.ok ? undefined : `Endpoint returned HTTP ${response.status}`,
        responseTimeMs,
      });

      return { deliveryId, status };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : "Webhook request failed";
      await ctx.runMutation(internal.webhook_deliveries.mutation.finish, {
        deliveryId,
        status: "failed",
        errorMessage: message,
        responseTimeMs,
      });
      return { deliveryId, status: "failed" };
    }
  },
});

export const trigger = internalAction({
  args: {
    projectId: v.id("projects"),
    eventType: v.union(
      v.literal("contract.event"),
      v.literal("transaction.succeeded"),
      v.literal("transaction.failed"),
      v.literal("project.registered"),
      v.literal("project.updated"),
      v.literal("payment.created"),
      v.literal("payment.succeeded"),
      v.literal("payment.failed"),
      v.literal("payment_access.activated"),
    ),
    contractEventId: v.optional(v.id("contractEvents")),
    paymentIntentId: v.optional(v.id("paymentIntents")),
    deliveryId: v.optional(v.id("webhookDeliveries")),
    attemptCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.webhook_endpoints.query.getDeliveryTargetInternal, {
      projectId: args.projectId,
      eventType: args.eventType,
      contractEventId: args.contractEventId,
      paymentIntentId: args.paymentIntentId,
    });
    if (!target) {
      return;
    }

    let deliveryId = args.deliveryId;
    let attemptCount = args.attemptCount ?? 1;
    let overrideEventId: string | undefined = undefined;

    if (deliveryId) {
      // This is a retry attempt
      await ctx.runMutation(internal.webhook_deliveries.mutation.startAttempt, {
        deliveryId,
        attemptCount,
      });
      const existingDelivery = await ctx.runQuery(internal.webhook_deliveries.query.getDelivery, {
        deliveryId,
      });
      if (existingDelivery?.payloadSummary?.id) {
        overrideEventId = existingDelivery.payloadSummary.id;
      }
    }

    const payload = buildPayload(target, args.eventType, false, overrideEventId);
    const signatureHeader = computeSignatureHeader(payload, target.endpoint.signingSecret);

    if (!deliveryId) {
      // This is the first attempt, create the pending log
      deliveryId = await ctx.runMutation(internal.webhook_deliveries.mutation.createPending, {
        projectId: args.projectId,
        endpointId: target.endpoint._id,
        eventType: args.eventType,
        destinationHost: target.endpoint.destinationHost,
        payloadSummary: payloadSummary(payload),
        paymentIntentId: args.paymentIntentId,
      });
    }

    const startTime = Date.now();
    try {
      const response = await fetch(target.endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Velo-Webhook/1.0",
          "x-velo-event": args.eventType,
          "x-velo-delivery": String(deliveryId),
          ...(signatureHeader ? { "x-velo-signature": signatureHeader } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        await ctx.runMutation(internal.webhook_deliveries.mutation.finish, {
          deliveryId,
          status: "success",
          httpStatus: response.status,
          responseTimeMs,
        });
      } else {
        const errorMessage = `Endpoint returned HTTP ${response.status}`;
        if (attemptCount < 5) {
          await ctx.runMutation(internal.webhook_deliveries.mutation.logAttemptFailure, {
            deliveryId,
            httpStatus: response.status,
            errorMessage,
            responseTimeMs,
          });
          const RETRY_DELAYS = [0, 15, 60, 300, 900];
          const delaySeconds = RETRY_DELAYS[attemptCount] ?? 900;
          await ctx.runMutation(internal.webhook_deliveries.mutation.scheduleRetry, {
            delaySeconds,
            projectId: args.projectId,
            eventType: args.eventType,
            contractEventId: args.contractEventId,
            paymentIntentId: args.paymentIntentId,
            deliveryId,
            attemptCount: attemptCount + 1,
          });
        } else {
          await ctx.runMutation(internal.webhook_deliveries.mutation.finish, {
            deliveryId,
            status: "failed",
            httpStatus: response.status,
            errorMessage,
            responseTimeMs,
          });
        }
      }
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Webhook request failed";

      if (attemptCount < 5) {
        await ctx.runMutation(internal.webhook_deliveries.mutation.logAttemptFailure, {
          deliveryId,
          errorMessage,
          responseTimeMs,
        });
        const RETRY_DELAYS = [0, 15, 60, 300, 900];
        const delaySeconds = RETRY_DELAYS[attemptCount] ?? 900;
        await ctx.runMutation(internal.webhook_deliveries.mutation.scheduleRetry, {
          delaySeconds,
          projectId: args.projectId,
          eventType: args.eventType,
          contractEventId: args.contractEventId,
          paymentIntentId: args.paymentIntentId,
          deliveryId,
          attemptCount: attemptCount + 1,
        });
      } else {
        await ctx.runMutation(internal.webhook_deliveries.mutation.finish, {
          deliveryId,
          status: "failed",
          errorMessage,
          responseTimeMs,
        });
      }
    }
  },
});
