import { withRouteTelemetry } from "@/core/observability";
import {
  parsePlaygroundJson,
  playgroundErrorResponse,
} from "@/features/playground/server/contract-loader";
import { submitHello } from "@/features/playground/server/transaction-service";

export const POST = withRouteTelemetry(
  "playground.transaction.submit.v1",
  async (request, telemetry) => {
    try {
      const result = await submitHello(await parsePlaygroundJson(request), telemetry.correlationId);
      return Response.json(result, {
        status: result.status === "pending" ? 202 : 200,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return playgroundErrorResponse(error, telemetry.correlationId);
    }
  },
);
