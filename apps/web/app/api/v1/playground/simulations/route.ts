import { withRouteTelemetry } from "@/core/observability";
import {
  parsePlaygroundJson,
  playgroundErrorResponse,
} from "@/features/playground/server/contract-loader";
import { simulateHello } from "@/features/playground/server/transaction-service";

export const POST = withRouteTelemetry(
  "playground.simulation.create.v1",
  async (request, telemetry) => {
    try {
      const result = await simulateHello(
        await parsePlaygroundJson(request),
        telemetry.correlationId,
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return playgroundErrorResponse(error, telemetry.correlationId);
    }
  },
);
