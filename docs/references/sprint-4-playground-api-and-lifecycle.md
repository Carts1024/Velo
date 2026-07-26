# Sprint 4 Playground API and lifecycle reference

Status: **IMPLEMENTED AND TESTED — LIVE WALLET/NETWORK EVIDENCE PENDING**

Audience: Playground API consumers, frontend developers, and test authors

Last reviewed: 2026-07-23

This reference describes the implemented Sprint 4 wire shapes and browser contracts.
The routes are anonymous, select RPC endpoints on the server, and return
`Cache-Control: no-store`. Mainnet contract loading and simulation are supported;
Mainnet signing and submission are not.

## Simulation

`POST /api/v1/playground/simulations`

```ts
type PlaygroundSimulationRequest = {
  network: "testnet" | "mainnet";
  contractId: string;
  expectedWasmHash: string;
  expectedSpecHash: string;
  sourceAccount: string;
  functionName: string;
  arguments: Record<string, CanonicalArgumentValue>;
  settings?: {
    baseFee?: string;
    cpuInstructions?: number;
  };
};
```

`settings` defaults to `{ baseFee: "100", cpuInstructions: 0 }`. Base fee accepts
whole-number stroops from `100` through `10_000_000`; CPU leeway accepts safe
integers from zero through `100_000_000`.

```ts
type PlaygroundSimulationResponse = {
  schemaVersion: 1;
  status: "success" | "restore_required";
  simulationId: string;
  correlationId: string;
  identity: string;
  contextKey: string;
  simulatedAt: string;
  expiresAt: string;
  latestLedger: number;
  request: {
    network: "testnet" | "mainnet";
    contractId: string;
    expectedWasmHash: string;
    expectedSpecHash: string;
    sourceAccount: string;
    functionName: string;
    settings: {
      baseFee: string;
      cpuInstructions: number;
    };
    argumentNames: string[];
  };
  unsignedXdr: string;
  transactionHash: string;
  review: PlaygroundTransactionReview;
  result: {
    decoded: JsonSafeValue | null;
    rawXdr: string | null;
  };
  fee: {
    base: string;
    minimumResource: string;
    total: string;
    excessiveThreshold: string;
  };
  authorization: {
    required: boolean;
    entries: AuthorizationEntry[];
  };
  footprint: {
    readOnly: LedgerKeyEvidence[];
    readWrite: LedgerKeyEvidence[];
  };
  warnings: SimulationWarning[];
  evidence: SimulationEvidence;
  signingEligible: boolean;
  safeguard?: {
    acknowledgementRequired: true;
    message: string;
  };
};

type PlaygroundTransactionReview = {
  network: "testnet" | "mainnet";
  sourceAccount: string;
  contractId: string;
  wasmHash: string;
  functionName: string;
  arguments: Array<{
    name: string;
    type: string;
    value: JsonSafeValue;
  }>;
  sequence: string;
  timeBounds: {
    minTime: string;
    maxTime: string;
  };
  baseFee: string;
  resourceFee: string;
  totalFee: string;
  authorization: AuthorizationEntry[];
  predictedWrites: LedgerKeyEvidence[];
  unsignedXdr: string;
  transactionHash: string;
};

type AuthorizationEntry = {
  credentials: string;
  xdr: string;
};

type LedgerKeyEvidence = {
  type: string;
  xdr: string;
};

type SimulationWarning = {
  code:
    | "ARCHIVED_STATE"
    | "AUTHORIZATION_REQUIRED"
    | "INSUFFICIENT_FEE_BALANCE"
    | "EXCESSIVE_FEE"
    | "NO_WRITES"
    | "DECODE_FALLBACK"
    | "MAINNET_SIMULATION_ONLY"
    | "EXECUTION_NOT_GUARANTEED";
  severity: "info" | "warning";
  source: "rpc" | "inference";
  message: string;
};

type SimulationEvidence = {
  rpcRequestId: string;
  transactionDataXdr?: string;
  resultXdr?: string;
  authorizationEntries: AuthorizationEntry[];
  diagnosticEvents: Array<{
    successfulCall: boolean;
    xdr: string;
  }>;
  stateChanges: Array<{
    type: number;
    keyXdr: string;
    beforeXdr: string | null;
    afterXdr: string | null;
  }>;
  restorePreamble?: {
    minResourceFee: string;
    transactionDataXdr: string;
  };
};
```

`review.transactionHash`, the top-level `transactionHash`, and the hash of
`review.unsignedXdr` identify the same assembled envelope. The transaction uses a
300-second timeout.

`SimulationEvidence` contains `rpcRequestId`, optional `transactionDataXdr` and
`resultXdr`, authorization entries, diagnostic events, state changes, and an
optional restore preamble.

For Mainnet, `signingEligible` is always false and `safeguard` is present. For a
restore preamble, `status` is `restore_required` and signing is also ineligible.

### Deprecated simulation compatibility

The legacy body remains accepted only for the configured Testnet hello fixture:

```ts
type DeprecatedHelloSimulationRequest = {
  network: "testnet";
  contractId: string;
  sourceAccount: string;
  argument: string;
  settings?: {
    baseFee?: string;
    cpuInstructions?: number;
  };
};
```

It is normalized into the generalized request. The generalized Sprint 4 response is
returned.

## Submission and status

`POST /api/v1/playground/transactions/submit`

```ts
type PlaygroundSubmitRequest = {
  network: "testnet";
  signedXdr: string;
  reviewedTransactionHash: string;
  expectedWasmHash: string;
};
```

`signedXdr` is limited to 200,000 characters. `reviewedTransactionHash` and
`expectedWasmHash` are normalized lowercase 64-character hexadecimal hashes.
`expectedWasmHash` may be omitted only for the deprecated configured-hello
compatibility path.

The browser initiates this request through Velo. The server verifies the envelope
and owns the call to its selected Testnet RPC. The endpoint rejects Mainnet, fee-bump
envelopes, more than one operation, non-contract operations, mismatched calls or
hashes, missing or invalid source signatures, unbounded/not-yet-valid/expired/overlong
time bounds, current Wasm drift, and unexpected RPC submission hashes.

The submit route returns HTTP 202 for pending and HTTP 200 for a terminal status.
`GET /api/v1/playground/transactions/{hash}` uses the same status shapes, always
queries Testnet, and also returns HTTP 202 for pending.

```ts
type PlaygroundTransactionStatus =
  | {
      status: "pending";
      transactionHash: string;
    }
  | {
      status: "success";
      transactionHash: string;
      ledger: number;
      result: {
        decoded: JsonSafeValue | null;
        rawXdr: string | null;
      };
      feeCharged: string;
      events: PlaygroundContractEvent[];
      evidence: FinalTransactionEvidence;
      explorerUrl: string;
    }
  | {
      status: "failed";
      transactionHash: string;
      ledger: number;
      code: "CONTRACT_FAILED";
      message: string;
      stage: "execution";
      evidence: FinalTransactionEvidence;
    };

type PlaygroundContractEvent = {
  order: number;
  contractId: string | null;
  topics: JsonSafeValue[];
  data: JsonSafeValue | null;
  rawXdr: string;
  ledger: number;
  transactionHash: string;
};

type FinalTransactionEvidence = {
  resultXdr: string;
  resultMetaXdr: string;
  diagnosticEventsXdr: string[];
};
```

`unknown` is not an API response. It is a browser lifecycle state reached after
bounded pending lookups. Manual **Check again** resumes lookup by hash without
resubmitting.

## Lifecycle

```ts
type TransactionLifecycleStatus =
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

type TransactionFailureStage =
  | "form"
  | "building"
  | "simulation"
  | "review"
  | "signing"
  | "submission"
  | "execution"
  | "expiry"
  | "timeout";

type TransactionLifecycle = {
  status: TransactionLifecycleStatus;
  transactionHash: string | null;
  error: {
    stage: TransactionFailureStage;
    message: string;
    correlationId?: string;
  } | null;
};

type TransactionLifecycleAction =
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
  | {
      type: "FAIL";
      stage: TransactionFailureStage;
      message: string;
      correlationId?: string;
    }
  | { type: "EXPIRE" }
  | { type: "UNKNOWN" };
```

The pure reducer ignores invalid transitions. In particular, it does not repeat
`REQUEST_SIGNATURE` while awaiting a wallet or `SUBMIT` while submitting.
`UNCONFIRM_REVIEW` returns a ready review to `reviewing`. A new `SIMULATE` may begin
from draft, simulation failure, review, expiry, failure, unknown, or success.
Signing/review/submission failures with a retained hash may retry
`REQUEST_SIGNATURE`; execution failures cannot.

## Refresh recovery

The exact key is `velo:playground:pending:v1`. Its entire accepted value is:

```ts
type PendingTransactionIdentity = {
  schemaVersion: 1;
  network: "testnet";
  transactionHash: string;
  startedAt: string;
};
```

Extra fields, another schema version or network, a malformed hash, or an invalid
timestamp invalidate the record. The client removes malformed and terminal records.
It never writes signed XDR, results, events, arguments, or wallet data into this
record.

Normal and refresh-recovery lookup use the same bounded helper: 15 attempts by
default, two seconds apart. Pending responses and transient lookup errors consume an
attempt. Exhaustion returns no terminal result and drives the browser to `unknown`;
it never triggers automatic resubmission.

## Wallet contract

The shared wallet state exposes `address`, `walletId`, `walletName`, `status`,
human-readable `error`, typed `errorCode`, supported-wallet metadata, stale address,
and `connect`, `disconnect`, and `signTransaction` operations.

```ts
type WalletErrorCode =
  | "WALLET_NOT_CONNECTED"
  | "WALLET_UNAVAILABLE"
  | "WALLET_REJECTED"
  | "WALLET_UNSUPPORTED"
  | "WALLET_STALE_SESSION"
  | "WALLET_NETWORK_MISMATCH"
  | "WALLET_SIGNING_FAILED";
```

`signTransaction` uses the Testnet network passphrase. A wallet-rejected signature
throws `WALLET_REJECTED`; other signing failures throw `WALLET_SIGNING_FAILED`.

## Integrity, errors, and privacy

Review confirmation is valid only for the fresh simulation context and exact
fingerprint. Network, account, contract ID/hashes, function, arguments, fee/CPU
settings, expiry, restore status, unsigned XDR, or transaction hash changes remove
signing eligibility or confirmation.

API errors use:

```ts
type PlaygroundErrorEnvelope = {
  error: {
    code: string;
    stage:
      | "validate"
      | "resolve-instance"
      | "fetch-wasm"
      | "parse"
      | "normalize"
      | "simulate"
      | "verify"
      | "submit"
      | "poll"
      | "decode";
    message: string;
    retryable: boolean;
    correlationId: string;
    diagnostics?: JsonSafeValue;
  };
};
```

The public stage comes from server validation, contract loading, simulation,
verification, submission, polling, or decoding. The browser maps user-facing work
to the more specific lifecycle failure stages above and retains a safe correlation
ID when present.

Public diagnostics are allowlisted and redacted. Signed envelopes are accepted only
by the submit route; they are neither echoed in responses nor persisted by recovery.
Private keys, secret seeds, wallet secrets, signatures, provider URLs, headers,
environment values, stacks, and configured secret-looking fields are excluded or
redacted.

## Compatibility and deferred behavior

- The legacy hello simulation body and submission body without
  `expectedWasmHash` remain supported for the configured fixture.
- Existing top-level simulation fields remain while the exact-XDR `review`,
  Mainnet warning, and safeguard extend the response.
- The historical function name `submitHello` remains as a deprecated alias for the
  generalized submit service.
- Fee bumps, multiple operations, multisig, contract-account authorization,
  sponsored fees, automatic restore, durable anonymous history, and Mainnet
  invocation remain unsupported.

Automated verification passed with 138 of 138 web tests, clean web lint/typechecks,
the production web build, focused contract-argument/specification tests, all 11
Playground fixture integration tests, and `git diff --check`. The full Stellar suite
retains the pre-existing `transaction-debugger.test.ts` process failure. Live Freighter, Testnet
submission/recovery, and Mainnet simulation evidence remain pending.
