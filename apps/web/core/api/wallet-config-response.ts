export type WalletConfigLookup =
  | {
      status: "not_found" | "unpublished" | "disabled" | "origin_rejected";
      corsAllowed?: true;
    }
  | {
      status: "ok";
      config: {
        schemaVersion: number;
        runtimeMajor: number;
        [key: string]: unknown;
      };
    };

export type WalletConfigHttpResult = {
  status: number;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
};

const statusDetails = {
  not_found: { status: 404, code: "CONFIG_NOT_FOUND", message: "Wallet configuration not found" },
  unpublished: {
    status: 404,
    code: "CONFIG_NOT_FOUND",
    message: "Wallet configuration has not been published",
  },
  disabled: {
    status: 410,
    code: "CONFIG_DISABLED",
    message: "Wallet integration is disabled",
  },
  origin_rejected: {
    status: 403,
    code: "ORIGIN_NOT_ALLOWED",
    message: "This origin is not allowed to use the wallet integration",
  },
} as const;

export function walletConfigHttpResult(
  result: WalletConfigLookup,
  origin?: string,
  preflight = false,
): WalletConfigHttpResult {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    Vary: "Origin",
  };

  if (origin && (result.status === "ok" || result.corsAllowed)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }

  if (result.status !== "ok") {
    const detail = statusDetails[result.status];
    return {
      status: detail.status,
      body: preflight ? null : { error: { code: detail.code, message: detail.message } },
      headers,
    };
  }

  if (result.config.schemaVersion !== 1 || result.config.runtimeMajor !== 1) {
    return {
      status: 409,
      body: preflight
        ? null
        : {
            error: {
              code: "CONFIG_INCOMPATIBLE",
              message: "Published configuration is incompatible with this runtime",
            },
          },
      headers,
    };
  }

  return {
    status: preflight ? 204 : 200,
    body: preflight ? null : result.config,
    headers,
  };
}
