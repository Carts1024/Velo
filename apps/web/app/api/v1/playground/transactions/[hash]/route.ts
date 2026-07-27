import { withRouteTelemetry } from "@/core/observability";
import { playgroundErrorResponse } from "@/features/playground/server/contract-loader";
import { guardPlaygroundRequest } from "@/features/playground/server/rate-limit";
import { transactionStatus } from "@/features/playground/server/transaction-service";

export const GET = withRouteTelemetry(
  "playground.transaction.retrieve.v1",
  async (request, telemetry, { params }: { params: Promise<{ hash: string }> }) => {
    const blocked = await guardPlaygroundRequest({
      request,
      operation: "status",
      correlationId: telemetry.correlationId,
    });
    if (blocked) return blocked;
    try {
      const { hash } = await params;
      const result = await transactionStatus(hash.toLowerCase());
      return Response.json(
        {
          ...result,
          playgroundRequestId: request.headers.get("x-velo-journey-id") ?? telemetry.correlationId,
        },
        {
          status: result.status === "pending" ? 202 : 200,
          headers: { "Cache-Control": "no-store" },
        },
      );
    } catch (error) {
      return playgroundErrorResponse(error, telemetry.correlationId);
    }
  },
);
