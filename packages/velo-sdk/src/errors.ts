export class VeloError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly param?: string;
  readonly requestId?: string;
  retryAfterMs?: number;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      param?: string;
      requestId?: string;
      retryAfterMs?: number;
    },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.status = options?.status;
    this.code = options?.code;
    this.param = options?.param;
    this.requestId = options?.requestId;
    this.retryAfterMs = options?.retryAfterMs;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class VeloRequestCancelledError extends VeloError {
  constructor(message = "Request was cancelled") {
    super(message, { code: "cancelled" });
  }
}

export class VeloProviderError extends VeloError {
  constructor(message: string, options?: { status?: number; code?: string; requestId?: string }) {
    super(message, options);
  }
}

export class VeloSubmissionUnknownError extends VeloError {
  constructor(
    message = "Transaction submission outcome is unknown; reconcile by transaction hash",
  ) {
    super(message, { code: "submission_unknown" });
  }
}

export class VeloAuthError extends VeloError {
  constructor(message: string, options?: { status?: number; code?: string; requestId?: string }) {
    super(message, options);
  }
}

export class VeloValidationError extends VeloError {
  constructor(
    message: string,
    options?: { status?: number; code?: string; param?: string; requestId?: string },
  ) {
    super(message, options);
  }
}

export class VeloRateLimitError extends VeloError {
  constructor(message: string, options?: { status?: number; code?: string; requestId?: string }) {
    super(message, options);
  }
}

export class VeloAPIError extends VeloError {
  constructor(message: string, options?: { status?: number; code?: string; requestId?: string }) {
    super(message, options);
  }
}

export class VeloTimeoutError extends VeloAPIError {
  constructor(message: string, options?: { requestId?: string }) {
    super(message, { ...options, status: 408, code: "timeout" });
  }
}

export class VeloWebhookSignatureVerificationError extends VeloValidationError {
  constructor(message: string) {
    super(message, { status: 400, code: "webhook_signature_verification_failed" });
  }
}

export function mapErrorResponse(status: number, payload: unknown, requestId?: string): VeloError {
  const errorObj =
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object"
      ? (payload.error as Record<string, unknown>)
      : {};
  const message =
    typeof errorObj.message === "string"
      ? errorObj.message
      : `Request failed with status ${status}`;
  const code = typeof errorObj.code === "string" ? errorObj.code : undefined;
  const param = typeof errorObj.param === "string" ? errorObj.param : undefined;
  const reqId = typeof errorObj.requestId === "string" ? errorObj.requestId : requestId;
  const errorType = typeof errorObj.type === "string" ? errorObj.type : undefined;

  const options = { status, code, param, requestId: reqId };

  if (status === 401 || errorType === "auth_error") {
    return new VeloAuthError(message, options);
  }
  if (status === 429 || errorType === "rate_limit_error") {
    return new VeloRateLimitError(message, options);
  }
  if (status === 502 || status === 503 || status === 504 || errorType === "provider_error") {
    return new VeloProviderError(message, options);
  }
  if (
    status === 400 ||
    status === 404 ||
    status === 409 ||
    errorType === "validation_error" ||
    errorType === "not_found_error" ||
    errorType === "idempotency_error"
  ) {
    return new VeloValidationError(message, options);
  }

  return new VeloAPIError(message, options);
}
