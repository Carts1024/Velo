import { createTraceparent, isCorrelationId, isTraceparent } from "@repo/observability";
import { PdaxClient } from "@repo/pdax";
import { makeFunctionReference } from "convex/server";
import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";

const http = httpRouter();
const MAX_BODY_BYTES = 64 * 1024;
const ingestRef = makeFunctionReference<"mutation">("provider_events/mutation:ingestPdax");

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function responseHeaders(correlationId: string) {
  return {
    "content-type": "application/json",
    "X-Correlation-Id": correlationId,
    "X-Request-Id": correlationId,
  };
}

function textResponse(status: number, message: string, correlationId: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: responseHeaders(correlationId),
  });
}

http.route({
  path: "/api/webhooks/pdax/v1",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const supplied = request.headers.get("x-correlation-id")?.trim();
    const correlationId = isCorrelationId(supplied) ? supplied : crypto.randomUUID();
    const suppliedTrace = request.headers.get("traceparent")?.trim();
    const traceparent = isTraceparent(suppliedTrace) ? suppliedTrace : createTraceparent();
    const configuredToken = process.env.PDAX_WEBHOOK_TOKEN;
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!configuredToken || !constantTimeEqual(token, configuredToken)) {
      return textResponse(401, "Unauthorized", correlationId);
    }
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (contentType !== "application/json")
      return textResponse(415, "JSON required", correlationId);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BODY_BYTES)
      return textResponse(413, "Payload too large", correlationId);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return textResponse(400, "Malformed JSON", correlationId);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return textResponse(400, "Invalid PDAX event", correlationId);
    }
    let normalized: ReturnType<PdaxClient["parseWebhook"]>;
    try {
      normalized = new PdaxClient().parseWebhook(value);
    } catch {
      return textResponse(400, "Invalid PDAX event schema", correlationId);
    }
    const input = normalized as unknown as Record<string, unknown>;
    const identifier = normalized.identifier;
    const type = normalized.transaction_type;
    const rawEvent = JSON.stringify(normalized);
    const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawEvent));
    const payloadDigest = Array.from(new Uint8Array(digestBytes), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const eventId = String(
      input.request_id ?? input.reference_number ?? input.reference_id ?? identifier,
    );
    const result = await ctx.runMutation(ingestRef, {
      eventId,
      identifier,
      type: type as "DEPOSIT" | "WITHDRAWAL",
      payloadDigest,
      status: typeof input.status === "string" ? input.status : undefined,
      requestCorrelationId: correlationId,
      traceparent,
    });
    return new Response(JSON.stringify(result), {
      status: result.status === "quarantined" ? 202 : 200,
      headers: responseHeaders(correlationId),
    });
  }),
});

export default http;
