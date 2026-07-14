"use node";

import { randomUUID } from "crypto";

import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";

import { internalAction } from "../_generated/server";
import { getOrRefreshPdaxConnection } from "../settlement/helpers";

const claimDueRef = makeFunctionReference<"mutation">(
  "provider_operations/mutations:claimDueReconciliation",
);
const finishRef = makeFunctionReference<"mutation">(
  "provider_operations/mutations:finishReconciliation",
);
const createSettlementRef = makeFunctionReference<"mutation">(
  "settlement_transactions/mutation:create",
);
const updateSettlementRef = makeFunctionReference<"mutation">(
  "settlement_transactions/mutation:updateStatus",
);
const reconcileRef = makeFunctionReference<"action">("provider_operations/actions:reconcileDue");

type ClaimedOperation = {
  _id: Id<"providerOperations">;
  projectId: Id<"projects">;
  operation: "trade" | "fiat_withdrawal";
  clientKey: string;
  providerKey: string;
  requestJson?: string;
  leaseGeneration: number;
};

type WithdrawalRequest = {
  amount: number;
  bankCode: string;
  accountName: string;
  accountNumber: string;
  paymentIntentId?: Id<"paymentIntents">;
};

export const reconcileDue = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 100);
    const leaseToken = randomUUID();
    const operations = (await ctx.runMutation(claimDueRef, {
      leaseToken,
      limit,
    })) as ClaimedOperation[];
    let resolved = 0;

    for (let offset = 0; offset < operations.length; offset += 10) {
      await Promise.all(
        operations.slice(offset, offset + 10).map(async (operation) => {
          if (operation.operation === "trade") {
            await ctx.runMutation(finishRef, {
              operationId: operation._id,
              leaseToken,
              leaseGeneration: operation.leaseGeneration,
              observation: "not_found",
              errorMessage:
                "PDAX cannot query trades by the persisted idempotency key; operator corroboration required",
            });
            return;
          }

          try {
            const request = JSON.parse(operation.requestJson ?? "{}") as WithdrawalRequest;
            const { accessToken, idToken, client } = await getOrRefreshPdaxConnection(
              ctx,
              operation.projectId,
            );
            const response = await client.getFiatTransactions(accessToken, idToken, {
              identifier: operation.providerKey,
              mode: "CashOut",
              page: 1,
              pageSize: 1,
            });
            const transaction = response.data?.[0];
            if (!transaction) {
              await ctx.runMutation(finishRef, {
                operationId: operation._id,
                leaseToken,
                leaseGeneration: operation.leaseGeneration,
                observation: "not_found",
                errorMessage: "PDAX withdrawal was not found by its stable identifier",
              });
              return;
            }

            const status = String(transaction.status ?? "").toUpperCase();
            const observation = ["COMPLETED", "SUCCESSFUL", "SUCCESS"].includes(status)
              ? "succeeded"
              : ["FAILED", "FAIL"].includes(status)
                ? "failed"
                : "pending";
            const settlementStatus =
              observation === "succeeded"
                ? "PAYOUT_SUCCEEDED"
                : observation === "failed"
                  ? "PAYOUT_FAILED"
                  : "PAYOUT_PENDING";
            await ctx.runMutation(createSettlementRef, {
              projectId: operation.projectId,
              paymentIntentId: request.paymentIntentId,
              provider: "pdax",
              status: settlementStatus,
              idempotencyId: operation.clientKey,
              withdrawalId: operation.providerKey,
            });
            await ctx.runMutation(updateSettlementRef, {
              projectId: operation.projectId,
              idempotencyId: operation.clientKey,
              status: settlementStatus,
              withdrawalId: operation.providerKey,
              withdrawalDetails: {
                referenceNumber:
                  transaction.request_id ?? transaction.reference_number ?? undefined,
                amount: Number(transaction.amount) || request.amount || 0,
                fee: Number(transaction.fee ?? 0) || 0,
                status: transaction.status,
                bankCode: request.bankCode ?? "unknown",
                accountName: request.accountName ?? "unknown",
                accountNumber: request.accountNumber ?? "unknown",
              },
            });
            await ctx.runMutation(finishRef, {
              operationId: operation._id,
              leaseToken,
              leaseGeneration: operation.leaseGeneration,
              observation,
              providerReference: operation.providerKey,
              resultJson: JSON.stringify(transaction),
            });
            if (observation !== "pending") resolved++;
          } catch {
            await ctx.runMutation(finishRef, {
              operationId: operation._id,
              leaseToken,
              leaseGeneration: operation.leaseGeneration,
              observation: "not_found",
              errorMessage: "dependency_unavailable",
            });
          }
        }),
      );
    }

    if (operations.length === limit) {
      await ctx.scheduler.runAfter(0, reconcileRef, { limit });
    }
    return { claimed: operations.length, resolved };
  },
});
