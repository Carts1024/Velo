import assert from "node:assert/strict";
import test from "node:test";

import { runPaymentApiSmoke } from "./payment-api-smoke.mjs";

test("runs the exact ten-request v1/v2 smoke contract", async () => {
  const calls = [];
  const intents = new Map();
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const parsedUrl = new URL(url);
    const version = parsedUrl.pathname.includes("/v1/") ? "v1" : "v2";
    const headers = {
      "content-type": "application/json",
      "server-timing":
        "velo_total;dur=10, convex.action;dur=8, auth;dur=1, rate_limit;dur=2, redis;dur=2, serialize;dur=.1",
      "x-correlation-id": init.headers["x-correlation-id"],
      "x-ratelimit-limit": "200",
      "x-ratelimit-remaining": "199",
    };

    if (init.method === "POST") {
      const key = init.headers["idempotency-key"];
      const body = JSON.parse(init.body);
      const existing = intents.get(key);
      if (existing && existing.amount !== body.amount) {
        return Response.json(
          { error: { code: "idempotency_key_conflict" } },
          { status: 409, headers },
        );
      }
      if (existing) return Response.json(existing, { status: 200, headers });
      const intent = {
        id: `pi_${version}`,
        paymentIntentId: `pi_${version}`,
        object: "payment_intent",
        amount: body.amount,
      };
      intents.set(key, intent);
      return Response.json(intent, { status: 201, headers });
    }

    const id = parsedUrl.pathname.split("/").at(-1);
    if (id !== "payment-intents") {
      const intent = [...intents.values()].find((value) => value.id === id);
      return Response.json(intent, { status: 200, headers });
    }
    return Response.json(
      {
        object: "list",
        data: [...intents.values()],
        hasMore: false,
        nextCursor: null,
      },
      { status: 200, headers },
    );
  };

  const result = await runPaymentApiSmoke({
    baseUrl: "https://staging.example.test",
    apiKey: `tk_live_${"a".repeat(32)}`,
    fetchImpl,
  });

  assert.equal(result.status, "passed");
  assert.equal(result.requests, 10);
  assert.equal(result.results.length, 10);
  assert.equal(calls.length, 10);
  assert.deepEqual(
    result.results.map((entry) => entry.httpStatus),
    [201, 200, 200, 200, 201, 200, 200, 200, 409, 200],
  );
});
