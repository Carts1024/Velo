import assert from "node:assert/strict";
import test from "node:test";

import { walletConfigHttpResult } from "../../core/api/wallet-config-response.ts";

const config = {
  schemaVersion: 1,
  runtimeMajor: 1,
  revision: 3,
  projectKey: "vw_pk_example",
};

test("allowed origins receive exact CORS and no-store headers", () => {
  const response = walletConfigHttpResult({ status: "ok", config }, "https://example.com");
  assert.equal(response.status, 200);
  assert.equal(response.headers["Access-Control-Allow-Origin"], "https://example.com");
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(response.body, config);
});

test("missing origins can read but receive no CORS header", () => {
  const response = walletConfigHttpResult({ status: "ok", config });
  assert.equal(response.status, 200);
  assert.equal(response.headers["Access-Control-Allow-Origin"], undefined);
});

test("endpoint maps public configuration failures", () => {
  assert.equal(walletConfigHttpResult({ status: "not_found" }).status, 404);
  assert.equal(walletConfigHttpResult({ status: "unpublished" }).status, 404);
  assert.equal(walletConfigHttpResult({ status: "disabled" }).status, 410);
  assert.equal(walletConfigHttpResult({ status: "origin_rejected" }).status, 403);
});

test("an allowed origin can read the disabled error without exposing the allowlist", () => {
  const response = walletConfigHttpResult(
    { status: "disabled", corsAllowed: true },
    "https://app.example.com",
  );
  assert.equal(response.status, 410);
  assert.equal(response.headers["Access-Control-Allow-Origin"], "https://app.example.com");
  assert.equal(JSON.stringify(response.body).includes("corsAllowed"), false);
});

test("incompatible publications return 409", () => {
  const response = walletConfigHttpResult({
    status: "ok",
    config: { ...config, runtimeMajor: 2 },
  });
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    error: {
      code: "CONFIG_INCOMPATIBLE",
      message: "Published configuration is incompatible with this runtime",
    },
  });
});

test("successful preflight has no body", () => {
  const response = walletConfigHttpResult({ status: "ok", config }, "http://localhost:3000", true);
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
});
