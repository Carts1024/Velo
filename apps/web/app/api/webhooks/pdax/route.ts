import { withRouteTelemetry } from "@/core/observability";
import { NextResponse } from "next/server";

export const POST = withRouteTelemetry("pdax.webhook.retired", async () => {
  return NextResponse.json(
    {
      error:
        "This unsigned callback endpoint has been retired. Re-register the versioned PDAX callback URL.",
    },
    { status: 410 },
  );
});
