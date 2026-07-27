import { withRouteTelemetry } from "@/core/observability";
import {
  parsePlaygroundJson,
  playgroundErrorResponse,
} from "@/features/playground/server/contract-loader";
import { guardPlaygroundRequest } from "@/features/playground/server/rate-limit";
import { submitHello } from "@/features/playground/server/transaction-service";

export const POST = withRouteTelemetry(
  "playground.transaction.submit.v1",
  async (request, telemetry) => {
    const blocked = await guardPlaygroundRequest({
      request,
      operation: "submission",
      correlationId: telemetry.correlationId,
      maxBytes: 512 * 1_024,
    });
    if (blocked) return blocked;
    try {
      const result = await submitHello(
        await parsePlaygroundJson(request, 512 * 1_024),
        telemetry.correlationId,
      );
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
