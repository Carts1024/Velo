import assert from "node:assert/strict";
import test from "node:test";

import { getDemoRedirectUrls, isCheckoutAnchor, requireApiKeyForAnchor } from "./config.ts";

test("checkout anchors accept only the two supported routing targets", () => {
  assert.equal(isCheckoutAnchor("inhouse"), true);
  assert.equal(isCheckoutAnchor("pdax"), true);
  assert.equal(isCheckoutAnchor("default"), false);
  assert.equal(isCheckoutAnchor(undefined), false);
});

test("each anchor resolves its dedicated API key", () => {
  const env = {
    VELO_INHOUSE_API_KEY: "tk_live_inhouse",
    VELO_PDAX_API_KEY: "tk_live_pdax",
  };

  assert.equal(requireApiKeyForAnchor("inhouse", env), "tk_live_inhouse");
  assert.equal(requireApiKeyForAnchor("pdax", env), "tk_live_pdax");
});

test("missing API keys report the selected anchor's variable", () => {
  assert.throws(
    () =>
      requireApiKeyForAnchor("pdax", {
        VELO_INHOUSE_API_KEY: "tk_live_inhouse",
      }),
    /VELO_PDAX_API_KEY is required/,
  );
});

test("in-house and PDAX cannot share one API key", () => {
  assert.throws(
    () =>
      requireApiKeyForAnchor("inhouse", {
        VELO_INHOUSE_API_KEY: "tk_live_shared",
        VELO_PDAX_API_KEY: "tk_live_shared",
      }),
    /must use different API keys/,
  );
});

test("demo redirects stay on the example app origin", () => {
  assert.deepEqual(getDemoRedirectUrls("http://localhost:3005/api/checkout"), {
    successUrl: "http://localhost:3005/success",
    cancelUrl: "http://localhost:3005/cancel",
  });
});
