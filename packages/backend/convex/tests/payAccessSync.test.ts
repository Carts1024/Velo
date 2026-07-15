/// <reference types="vite/client" />
import { expect, test } from "vitest";

import { payAccessContractIdFromEnv } from "../payAccessSync";

const BACKEND_PAY_ACCESS_CONTRACT_ID = "CBHDLZYSYWETHPC6KDGH35S4SNBU5P7QWLNNDWYXJRHZMZDTQSKYVOXJ";
const PUBLIC_FALLBACK_CONTRACT_ID = "CBSR5LFHR5Q2X3PO3HSMGXI43YEUYGFTHUPGNVGW6XH2VNOQUEUHIEJR";

test("payAccessContractIdFromEnv prefers the backend contract ID", () => {
  expect(
    payAccessContractIdFromEnv({
      VELO_PAY_ACCESS_CONTRACT_ID: BACKEND_PAY_ACCESS_CONTRACT_ID,
      NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID: PUBLIC_FALLBACK_CONTRACT_ID,
    }),
  ).toBe(BACKEND_PAY_ACCESS_CONTRACT_ID);
});

test("payAccessContractIdFromEnv keeps the public fallback for local compatibility", () => {
  expect(
    payAccessContractIdFromEnv({
      NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID: PUBLIC_FALLBACK_CONTRACT_ID,
    }),
  ).toBe(PUBLIC_FALLBACK_CONTRACT_ID);
});

test("payAccessContractIdFromEnv rejects missing IDs instead of using a hardcoded fallback", () => {
  expect(() => payAccessContractIdFromEnv({})).toThrow(/VELO_PAY_ACCESS_CONTRACT_ID/);
});
