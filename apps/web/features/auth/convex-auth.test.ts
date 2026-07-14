import assert from "node:assert/strict";
import test from "node:test";

import { shouldReportWalletAuthenticated } from "../../core/auth/convex-auth.ts";

test("protected routes stay unauthenticated until the Convex token exists", () => {
  assert.equal(
    shouldReportWalletAuthenticated({
      walletStatus: "connected",
      walletAddress: "GABC",
      hasValidToken: false,
    }),
    false,
  );
});

test("a connected wallet with a valid Convex token is authenticated", () => {
  assert.equal(
    shouldReportWalletAuthenticated({
      walletStatus: "connected",
      walletAddress: "GABC",
      hasValidToken: true,
    }),
    true,
  );
});

test("public routes do not start wallet auth without a cached token", () => {
  assert.equal(
    shouldReportWalletAuthenticated({
      walletStatus: "connected",
      walletAddress: "GABC",
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
      hasValidToken: true,
    }),
    true,
  );
});
