import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeOptionalContractId,
  requirePublicContractConfig,
  resolveBackendPayAccessContractId,
  resolvePublicContractConfig,
} from "./contract-config.ts";

const REGISTRY_CONTRACT_ID = "CBSR5LFHR5Q2X3PO3HSMGXI43YEUYGFTHUPGNVGW6XH2VNOQUEUHIEJR";
const PAY_ACCESS_CONTRACT_ID = "CBHDLZYSYWETHPC6KDGH35S4SNBU5P7QWLNNDWYXJRHZMZDTQSKYVOXJ";
const FALLBACK_PAY_ACCESS_CONTRACT_ID = REGISTRY_CONTRACT_ID;

test("normalizeOptionalContractId normalizes valid IDs and keeps blanks empty", () => {
  assert.equal(
    normalizeOptionalContractId(` ${PAY_ACCESS_CONTRACT_ID.toLowerCase()} `, "PAY_ID"),
    PAY_ACCESS_CONTRACT_ID,
  );
  assert.equal(normalizeOptionalContractId(" ", "PAY_ID"), null);
  assert.equal(normalizeOptionalContractId(undefined, "PAY_ID"), null);
});

test("normalizeOptionalContractId rejects malformed contract IDs with env context", () => {
  assert.throws(
    () => normalizeOptionalContractId("not-a-contract", "VELO_PAY_ACCESS_CONTRACT_ID"),
    /VELO_PAY_ACCESS_CONTRACT_ID.*valid Stellar contract ID/,
  );
});

test("resolvePublicContractConfig validates both public contract IDs", () => {
  assert.deepEqual(
    resolvePublicContractConfig({
      registryContractId: REGISTRY_CONTRACT_ID.toLowerCase(),
      payAccessContractId: PAY_ACCESS_CONTRACT_ID.toLowerCase(),
    }),
    {
      registryContractId: REGISTRY_CONTRACT_ID,
      payAccessContractId: PAY_ACCESS_CONTRACT_ID,
    },
  );
});

test("requirePublicContractConfig rejects missing hosted contract IDs", () => {
  assert.throws(
    () =>
      requirePublicContractConfig({
        registryContractId: REGISTRY_CONTRACT_ID,
      }),
    /NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID/,
  );
});

test("resolveBackendPayAccessContractId prefers the backend env var", () => {
  assert.equal(
    resolveBackendPayAccessContractId({
      payAccessContractId: PAY_ACCESS_CONTRACT_ID,
      publicPayAccessContractId: FALLBACK_PAY_ACCESS_CONTRACT_ID,
    }),
    PAY_ACCESS_CONTRACT_ID,
  );
});

test("resolveBackendPayAccessContractId keeps public fallback for local compatibility", () => {
  assert.equal(
    resolveBackendPayAccessContractId({
      publicPayAccessContractId: FALLBACK_PAY_ACCESS_CONTRACT_ID,
    }),
    FALLBACK_PAY_ACCESS_CONTRACT_ID,
  );
});

test("resolveBackendPayAccessContractId rejects absent IDs instead of using a hardcoded fallback", () => {
  assert.throws(() => resolveBackendPayAccessContractId({}), /VELO_PAY_ACCESS_CONTRACT_ID/);
});
