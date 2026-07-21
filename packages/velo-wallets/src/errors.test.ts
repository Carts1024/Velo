import { describe, expect, test } from "vitest";

import { errorMessage, normalizeWalletError } from "./errors.js";

describe("wallet error normalization", () => {
  test("preserves messages from Wallets Kit error objects", () => {
    const error = { code: -3, message: "Please set the wallet first" };

    expect(errorMessage(error)).toBe("Please set the wallet first");
    expect(normalizeWalletError(error, "RUNTIME_INIT_FAILED")).toMatchObject({
      code: "RUNTIME_INIT_FAILED",
      message: "Please set the wallet first",
      cause: error,
    });
  });

  test("preserves string errors and safely labels unknown values", () => {
    expect(errorMessage("Wallet provider unavailable")).toBe("Wallet provider unavailable");
    expect(errorMessage(null)).toBe("Unknown wallet error");
  });
});
