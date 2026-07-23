import { withRouteTelemetry } from "@/core/observability";
import {
  parsePlaygroundJson,
  playgroundErrorResponse,
} from "@/features/playground/server/contract-loader";
import { simulatePlayground } from "@/features/playground/server/transaction-service";

export const POST = withRouteTelemetry(
  "playground.simulation.create.v1",
  async (request, telemetry) => {
    try {
      const result = await simulatePlayground(
        await parsePlaygroundJson(request),
        telemetry.correlationId,
      );
      return Response.json(result, {
        headers: {
          "Cache-Control": "no-store",
          "X-Correlation-ID": telemetry.correlationId,
        },
      });
    } catch (error) {
      return playgroundErrorResponse(error, telemetry.correlationId);
    }
  },
);
