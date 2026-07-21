export const VELO_WALLET_ERROR_CODES = [
  "CONFIG_NOT_FOUND",
  "CONFIG_DISABLED",
  "ORIGIN_NOT_ALLOWED",
  "CONFIG_INCOMPATIBLE",
  "RUNTIME_INIT_FAILED",
  "WALLET_UNAVAILABLE",
  "CONNECTION_REJECTED",
  "POPUP_BLOCKED",
  "NETWORK_MISMATCH",
  "SESSION_STALE",
  "SIGNING_REJECTED",
  "SIGNING_FAILED",
  "WALLET_METHOD_UNSUPPORTED",
] as const;

export type VeloWalletErrorCode = (typeof VELO_WALLET_ERROR_CODES)[number];

export class VeloWalletError extends Error {
  readonly code: VeloWalletErrorCode;
  readonly cause?: unknown;

  constructor(code: VeloWalletErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "VeloWalletError";
    this.code = code;
    this.cause = cause;
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown wallet error";
}

export function normalizeWalletError(
  error: unknown,
  fallbackCode: VeloWalletErrorCode,
): VeloWalletError {
  if (error instanceof VeloWalletError) return error;

  const message = errorMessage(error);
  if (/reject|denied|cancel/i.test(message)) {
    return new VeloWalletError(
      fallbackCode === "SIGNING_FAILED" ? "SIGNING_REJECTED" : "CONNECTION_REJECTED",
      message,
      error,
    );
  }
  if (/popup|window.*blocked/i.test(message)) {
    return new VeloWalletError("POPUP_BLOCKED", message, error);
  }
  if (/not support|unsupported method|not implemented/i.test(message)) {
    return new VeloWalletError("WALLET_METHOD_UNSUPPORTED", message, error);
  }

  return new VeloWalletError(fallbackCode, message, error);
}
