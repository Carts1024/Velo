import assert from "node:assert/strict";
import test from "node:test";

import { shouldReportWalletAuthenticated } from "../../core/auth/convex-auth.ts";

test("protected routes bootstrap Convex auth after wallet connection", () => {
  assert.equal(
    shouldReportWalletAuthenticated({
      walletStatus: "connected",
      walletAddress: "GABC",
      pathname: "/login",
      hasValidToken: false,
    }),
    true,
  );
});

test("public routes do not start wallet auth without a cached token", () => {
  assert.equal(
    shouldReportWalletAuthenticated({
      walletStatus: "connected",
      walletAddress: "GABC",
      pathname: "/",
      hasValidToken: false,
    }),
    false,
  );
});

test("a cached token keeps a connected wallet authenticated on public routes", () => {
  assert.equal(
    shouldReportWalletAuthenticated({
      walletStatus: "connected",
      walletAddress: "GABC",
      pathname: "/",
      hasValidToken: true,
    }),
    true,
  );
});
