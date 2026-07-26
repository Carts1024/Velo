import { withRouteTelemetry } from "@/core/observability";
import { playgroundErrorResponse } from "@/features/playground/server/contract-loader";
import { transactionStatus } from "@/features/playground/server/transaction-service";

export const GET = withRouteTelemetry(
  "playground.transaction.retrieve.v1",
  async (_request, telemetry, { params }: { params: Promise<{ hash: string }> }) => {
    try {
      const { hash } = await params;
      const result = await transactionStatus(hash.toLowerCase());
      return Response.json(result, {
        status: result.status === "pending" ? 202 : 200,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return playgroundErrorResponse(error, telemetry.correlationId);
    }
  },
);
