import { withRouteTelemetry } from "@/core/observability";
import {
  contractSpecLoader,
  parsePlaygroundJson,
  playgroundErrorResponse,
} from "@/features/playground/server/contract-loader";
import { helloInvocationEligibility } from "@/features/playground/server/fixture";

export const POST = withRouteTelemetry(
  "playground.contract.load.v1",
  async (request, telemetry) => {
    try {
      const body = await parsePlaygroundJson(request);
      const document = await contractSpecLoader.load(body, telemetry.correlationId);
      return Response.json(
        {
          ...document,
          invocation: {
            eligible: helloInvocationEligibility(
              document.network,
              document.contractId,
              document.wasmHash,
            ),
            functionName: "hello",
            reason:
              document.network === "mainnet"
                ? "Mainnet is inspection-only in Sprint 1."
                : "Only the configured Testnet hello fixture can be invoked in Sprint 1.",
          },
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-Correlation-ID": document.correlationId,
          },
        },
      );
    } catch (error) {
      return playgroundErrorResponse(error, telemetry.correlationId);
    }
  },
);
