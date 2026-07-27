import { withRouteTelemetry } from "@/core/observability";
import {
  parsePlaygroundJson,
  playgroundErrorResponse,
} from "@/features/playground/server/contract-loader";
import { guardPlaygroundRequest } from "@/features/playground/server/rate-limit";
import { simulatePlayground } from "@/features/playground/server/transaction-service";

export const POST = withRouteTelemetry(
  "playground.simulation.create.v1",
  async (request, telemetry) => {
    const blocked = await guardPlaygroundRequest({
      request,
      operation: "simulation",
      correlationId: telemetry.correlationId,
      maxBytes: 256 * 1_024,
    });
    if (blocked) return blocked;
    try {
      const result = await simulatePlayground(
        await parsePlaygroundJson(request, 256 * 1_024),
        telemetry.correlationId,
      );
      return Response.json(
        {
          ...result,
          playgroundRequestId: request.headers.get("x-velo-journey-id") ?? telemetry.correlationId,
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-Correlation-ID": telemetry.correlationId,
          },
        },
      );
    } catch (error) {
      return playgroundErrorResponse(error, telemetry.correlationId);
    }
  },
);
