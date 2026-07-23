export type TransactionFailureStage =
  | "form"
  | "building"
  | "simulation"
  | "review"
  | "signing"
  | "submission"
  | "execution"
  | "expiry"
  | "timeout";

export type TransactionLifecycleStatus =
  | "draft"
  | "simulating"
  | "simulation_failed"
  | "reviewing"
  | "ready_to_sign"
  | "awaiting_wallet"
  | "signed"
  | "submitting"
  | "pending"
  | "successful"
  | "failed"
  | "expired"
  | "unknown";

export type TransactionLifecycle = {
  status: TransactionLifecycleStatus;
  transactionHash: string | null;
  error: {
    stage: TransactionFailureStage;
    message: string;
    correlationId?: string;
  } | null;
};

export const initialTransactionLifecycle: TransactionLifecycle = {
  status: "draft",
  transactionHash: null,
  error: null,
};

export type TransactionLifecycleAction =
  | { type: "RESET" }
  | { type: "SIMULATE" }
  | { type: "REVIEW"; transactionHash: string }
  | { type: "CONFIRM_REVIEW" }
  | { type: "UNCONFIRM_REVIEW" }
  | { type: "REQUEST_SIGNATURE" }
  | { type: "SIGNED" }
  | { type: "SUBMIT" }
  | { type: "PENDING"; transactionHash?: string }
  | { type: "SUCCESS" }
  | { type: "FAIL"; stage: TransactionFailureStage; message: string; correlationId?: string }
  | { type: "EXPIRE" }
  | { type: "UNKNOWN" };

export function transactionLifecycleReducer(
  state: TransactionLifecycle,
  action: TransactionLifecycleAction,
): TransactionLifecycle {
  switch (action.type) {
    case "RESET":
      return initialTransactionLifecycle;
    case "SIMULATE":
      return state.status === "draft" ||
        state.status === "simulation_failed" ||
        state.status === "reviewing" ||
        state.status === "ready_to_sign" ||
        state.status === "expired" ||
        state.status === "failed" ||
        state.status === "unknown" ||
        state.status === "successful"
        ? { status: "simulating", transactionHash: null, error: null }
        : state;
    case "REVIEW":
      return state.status === "simulating"
        ? { status: "reviewing", transactionHash: action.transactionHash, error: null }
        : state;
    case "CONFIRM_REVIEW":
      return state.status === "reviewing" ? { ...state, status: "ready_to_sign" } : state;
    case "UNCONFIRM_REVIEW":
      return state.status === "ready_to_sign" ? { ...state, status: "reviewing" } : state;
    case "REQUEST_SIGNATURE":
      return state.status === "ready_to_sign" ||
        (state.status === "failed" &&
          state.transactionHash !== null &&
          (state.error?.stage === "signing" ||
            state.error?.stage === "review" ||
            state.error?.stage === "submission"))
        ? { ...state, status: "awaiting_wallet", error: null }
        : state;
    case "SIGNED":
      return state.status === "awaiting_wallet" ? { ...state, status: "signed" } : state;
    case "SUBMIT":
      return state.status === "signed" ? { ...state, status: "submitting" } : state;
    case "PENDING":
      return state.status === "submitting" ||
        state.status === "pending" ||
        state.status === "unknown" ||
        state.status === "draft"
        ? {
            status: "pending",
            transactionHash: action.transactionHash ?? state.transactionHash,
            error: null,
          }
        : state;
    case "SUCCESS":
      return state.status === "submitting" || state.status === "pending"
        ? { ...state, status: "successful", error: null }
        : state;
    case "FAIL":
      return {
        ...state,
        status: action.stage === "simulation" ? "simulation_failed" : "failed",
        error: {
          stage: action.stage,
          message: action.message,
          ...(action.correlationId ? { correlationId: action.correlationId } : {}),
        },
      };
    case "EXPIRE":
      return state.status === "pending" ||
        state.status === "reviewing" ||
        state.status === "ready_to_sign"
        ? { ...state, status: "expired", error: null }
        : state;
    case "UNKNOWN":
      return state.status === "pending"
        ? {
            ...state,
            status: "unknown",
            error: {
              stage: "timeout",
              message: "The transaction is unresolved. Checking stopped without cancelling it.",
            },
          }
        : state;
  }
}

export const PLAYGROUND_PENDING_STORAGE_KEY = "velo:playground:pending:v1";

export type PendingTransactionIdentity = {
  schemaVersion: 1;
  network: "testnet";
  transactionHash: string;
  startedAt: string;
};

export function parsePendingTransaction(value: string | null): PendingTransactionIdentity | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      Object.keys(parsed).some(
        (key) => !["schemaVersion", "network", "transactionHash", "startedAt"].includes(key),
      ) ||
      parsed.schemaVersion !== 1 ||
      parsed.network !== "testnet" ||
      typeof parsed.transactionHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(parsed.transactionHash) ||
      typeof parsed.startedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.startedAt))
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      network: "testnet",
      transactionHash: parsed.transactionHash,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export async function pollPendingTransaction<T>(
  lookup: () => Promise<T>,
  isPending: (result: T) => boolean,
  options: {
    attempts?: number;
    wait?: () => Promise<void>;
    onResult?: (result: T) => void;
  } = {},
): Promise<T | null> {
  const attempts = options.attempts ?? 15;
  const wait = options.wait ?? (() => new Promise((resolve) => setTimeout(resolve, 2_000)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await lookup();
      options.onResult?.(result);
      if (!isPending(result)) return result;
    } catch {
      // Lookup failures are transient until the bounded polling window ends.
    }
    if (attempt + 1 < attempts) await wait();
  }
  return null;
}
