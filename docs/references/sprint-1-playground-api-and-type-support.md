# Sprint 1 Playground API and type-support reference

Status: **IMPLEMENTED — LIVE EVIDENCE PENDING**  
Audience: frontend developers, package consumers, and test authors  
Schema: `ContractSpecDocumentV1`, version `1`

This reference describes the code implemented for Sprint 1. Angle-bracket values
such as `<CONTRACT_ID>` are placeholders, not deployed identifiers or captured live
evidence.

## HTTP conventions

The Playground routes are anonymous and return JSON. Successful and failed responses
use `Cache-Control: no-store`. Error responses and contract-load responses include
`X-Correlation-ID`; route telemetry can add the repository's shared telemetry
headers.

### Error envelope

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
  };
};
```

The message is safe for display. Do not infer that an upstream provider's raw error
is available from this response.

## Load a contract specification

`POST /api/v1/playground/contracts/load`

```ts
type ContractLoadRequest = {
  network: "testnet" | "mainnet";
  contractId: string;
};
```

The server trims and uppercases `contractId`, validates it before RPC work, resolves
the current Wasm hash, and returns `ContractSpecDocumentV1` plus:

```ts
type InvocationCapability = {
  invocation: {
    eligible: boolean;
    functionName: "hello";
    reason: string;
  };
};
```

`eligible` is true only when the loaded contract and current Wasm match the
configured Testnet hello fixture. The `reason` is explanatory; use `eligible` as the
capability flag.

Success is HTTP 200. The normalized response includes:

| Field           | Type                             | Meaning                                             |
| --------------- | -------------------------------- | --------------------------------------------------- |
| `schemaVersion` | `1`                              | Normalized contract version discriminator           |
| `network`       | `testnet \| mainnet`             | RPC network used for this load                      |
| `contractId`    | `string`                         | Validated canonical contract StrKey                 |
| `wasmHash`      | `string`                         | Current contract instance Wasm hash                 |
| `specHash`      | `string`                         | SHA-256 of ordered, length-prefixed spec-entry XDR  |
| `latestLedger`  | `number`                         | Latest ledger returned while resolving the instance |
| `loadedAt`      | ISO timestamp string             | Server load time                                    |
| `correlationId` | `string`                         | Request correlation identifier                      |
| `rawEntries`    | `ContractSpecSource[]`           | Ordered base64 source entry XDR                     |
| `functions`     | `NormalizedContractFunction[]`   | Functions, parameters, outputs, docs, and source    |
| `customTypes`   | `NormalizedContractCustomType[]` | Struct, enum, and union definitions                 |
| `errors`        | `NormalizedContractErrorEnum[]`  | Contract error enums                                |
| `events`        | `NormalizedContractSpecEvent[]`  | Event definitions                                   |

## Simulate the allowlisted hello call

`POST /api/v1/playground/simulations`

```ts
type HelloSimulationRequest = {
  network: "testnet";
  contractId: string;
  sourceAccount: string;
  argument: string;
};
```

`sourceAccount` must be an Ed25519 account StrKey. `argument` must contain 1–32
ASCII letters, digits, or underscores. The contract must be the configured fixture
and its current Testnet Wasm hash must match configuration.

Success is HTTP 200:

```ts
type HelloSimulationResponse = {
  unsignedXdr: string;
  transactionHash: string;
  expiresAt: string;
  fee: {
    base: string;
    resource: string;
    total: string;
  };
  review: {
    network: "testnet";
    sourceAccount: string;
    contractId: string;
    wasmHash: string;
    functionName: "hello";
    arguments: Array<{
      name: "to";
      type: "symbol";
      value: string;
    }>;
    sequence: string;
    timeBounds: {
      minTime: string;
      maxTime: string;
    };
    baseFee: string;
    resourceFee: string;
    totalFee: string;
    transactionHash: string;
  };
};
```

Fees are decimal strings in stroops. Review fields and `transactionHash` are derived
from the assembled unsigned transaction, not copied from request fields.

## Submit a signed hello transaction

`POST /api/v1/playground/transactions/submit`

```ts
type HelloSubmitRequest = {
  network: "testnet";
  signedXdr: string;
  reviewedTransactionHash: string;
};
```

`signedXdr` is limited to 200,000 characters. The hash must be 64 lowercase
hexadecimal characters after request normalization. The server requires a valid
source-account signature and verifies the exact reviewed hash, call, argument,
operation count, and time bound. Fee-bump envelopes are rejected.

Success returns one of the transaction-status shapes below. A pending response uses
HTTP 202; terminal responses use HTTP 200.

## Get transaction status

`GET /api/v1/playground/transactions/{hash}`

The route lowercases `{hash}` and then requires exactly 64 hexadecimal characters.
It always queries Testnet.

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
      result: JsonSafeValue;
      explorerUrl: string;
    }
  | {
      status: "failed";
      transactionHash: string;
      ledger: number;
      code: "CONTRACT_FAILED";
      message: "The contract transaction failed.";
    };
```

A pending result is HTTP 202. Success and contract failure are HTTP 200. A successful
Soroban return value is converted through `scValToNative` and then into the
`JsonSafeValue` representation described below.

## HTTP error mapping

| HTTP status | Stable codes                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400         | `INVALID_REQUEST`, `INVALID_NETWORK`, `INVALID_CONTRACT_ID`, `INVALID_ARGUMENT`, `INVALID_SOURCE_ACCOUNT`, `INVALID_TRANSACTION_HASH`, `MALFORMED_ENVELOPE`                                                                                                                                                  |
| 403         | `MAINNET_INVOCATION_DISABLED`, `CONTRACT_NOT_ALLOWLISTED`                                                                                                                                                                                                                                                    |
| 404         | `CONTRACT_NOT_FOUND`                                                                                                                                                                                                                                                                                         |
| 422         | `SPEC_TOO_LARGE`, `MALFORMED_SPEC`, `UNSUPPORTED_SPEC_ENTRY`, `UNSUPPORTED_SPEC_TYPE`, `ENVELOPE_OPERATION_MISMATCH`, `ENVELOPE_CALL_MISMATCH`, `ENVELOPE_HASH_MISMATCH`, `MISSING_SIGNATURE`, `INVALID_SIGNATURE`, `FEE_BUMP_NOT_ALLOWED`, `UNBOUNDED_TRANSACTION`, `SIMULATION_EXPIRED`                    |
| 503         | `FIXTURE_NOT_CONFIGURED`                                                                                                                                                                                                                                                                                     |
| 504         | `RPC_TIMEOUT`                                                                                                                                                                                                                                                                                                |
| 502         | `RPC_UPSTREAM` and implemented codes without a dedicated mapping, including `RPC_CONFIGURATION_ERROR`, `SOURCE_ACCOUNT_NOT_FOUND`, `FIXTURE_DRIFT`, `SIMULATION_FAILED`, `RESULT_DECODE_FAILED`, `UNSUPPORTED_CONTRACT_VALUE`, `SUBMISSION_HASH_MISMATCH`, `SUBMISSION_REJECTED`, and `SUBMISSION_RETRYABLE` |

`retryable` is true for retryable upstream failures, simulation failure, and
`SUBMISSION_RETRYABLE`; clients must still re-check state before resubmitting.

## `@repo/stellar` public surface

`@repo/stellar` exports the following Sprint 1 symbols from its package root:

- types: `PlaygroundNetwork`, `JsonSafeValue`, `NormalizedContractSpecType`,
  `ContractSpecSource`, `NormalizedContractParameter`,
  `NormalizedContractOutput`, `NormalizedContractFunction`,
  `NormalizedContractCustomType`, `NormalizedContractError`,
  `NormalizedContractErrorEnum`, `NormalizedContractSpecEvent`,
  `ContractSpecDocumentV1`, and `ContractSpecStage`;
- error: `ContractSpecError`;
- functions: `normalizeContractSpecType`, `normalizeContractSpec`,
  `computeContractSpecHash`, and `toJsonSafeContractValue`.

The package is private and versioned with the monorepo. Consumers must use
`schemaVersion` rather than package version to discriminate normalized document
shape.

### Normalize committed spec-entry XDR

This TypeScript example reads the deterministic hello fixture. `UNDEPLOYED`,
`LOCAL_BUILD`, ledger `0`, and the Unix epoch are explicit local-fixture metadata;
they are not valid values for the contract-load HTTP API or evidence of a Testnet
deployment.

```ts
import { readFile } from "node:fs/promises";

import { normalizeContractSpec } from "@repo/stellar";
import { xdr } from "@stellar/stellar-sdk";

const encodedEntries = JSON.parse(
  await readFile("contracts/playground-fixtures/spec-fixtures/raw/hello.xdr.json", "utf8"),
) as string[];

const document = normalizeContractSpec(
  encodedEntries.map((encoded) => xdr.ScSpecEntry.fromXDR(encoded, "base64")),
  {
    network: "testnet",
    contractId: "UNDEPLOYED",
    wasmHash: "LOCAL_BUILD",
    latestLedger: 0,
    loadedAt: "1970-01-01T00:00:00.000Z",
    correlationId: "local-example",
  },
);

if (document.schemaVersion !== 1) {
  throw new Error("Unsupported normalized contract-spec version");
}

console.log(document.functions[0]?.name);
```

### JSON-safe result rules

`toJsonSafeContractValue` preserves:

- `null`, strings, booleans, and finite numbers as-is;
- `bigint` as a decimal string;
- `Buffer` and `Uint8Array` as `{ "encoding": "base64", "value": "..." }`;
- arrays recursively as arrays;
- maps as ordered arrays of `{ "key": ..., "value": ... }`;
- plain objects recursively as objects.

Unsupported values fail with `UNSUPPORTED_CONTRACT_VALUE` at stage `decode`.

## Version 1 Soroban type-support matrix

The columns describe three different support levels:

- **Normalized** means `normalizeContractSpecType` has a version 1 representation.
- **Fixture** means committed raw and normalized snapshots exercise the type.
- **Browser invocation** means Sprint 1 accepts user input for that type.

Inspection renders normalized type labels for every version 1 kind. It is not a
general-purpose argument editor.

| Soroban spec type           | Version 1 representation                | Normalized | Deterministic fixture                    | Browser invocation           |
| --------------------------- | --------------------------------------- | ---------: | ---------------------------------------- | ---------------------------- |
| value                       | `{ kind: "value" }`                     |        Yes | `collections`                            | No                           |
| bool                        | `{ kind: "bool" }`                      |        Yes | `collections`                            | No                           |
| void                        | `{ kind: "void" }`                      |        Yes | `auth-events-errors`                     | No                           |
| error                       | `{ kind: "error" }`                     |        Yes | `collections`                            | No                           |
| u32, i32                    | scalar kind                             |        Yes | `numeric`; also collection/auth fixtures | No                           |
| u64, i64                    | scalar kind                             |        Yes | `numeric`                                | No                           |
| u128, i128                  | scalar kind                             |        Yes | `numeric`                                | No                           |
| u256, i256                  | scalar kind                             |        Yes | `numeric`                                | No                           |
| timepoint, duration         | scalar kind                             |        Yes | `numeric`                                | No                           |
| bytes                       | `{ kind: "bytes" }`                     |        Yes | `collections`                            | No                           |
| fixed bytes                 | `{ kind: "bytesN", length }`            |        Yes | `collections` with length 32             | No                           |
| string                      | `{ kind: "string" }`                    |        Yes | `collections`, `custom-types`            | No                           |
| symbol                      | `{ kind: "symbol" }`                    |        Yes | `hello`, `collections`, `custom-types`   | **Yes, hello argument only** |
| address                     | `{ kind: "address" }`                   |        Yes | `auth-events-errors`                     | No                           |
| muxed address               | `{ kind: "muxedAddress" }`              |        Yes | No                                       | No                           |
| option                      | `{ kind: "option", valueType }`         |        Yes | `collections`                            | No                           |
| result                      | `{ kind: "result", okType, errorType }` |        Yes | `collections`, `auth-events-errors`      | No                           |
| vector                      | `{ kind: "vector", elementType }`       |        Yes | `hello`, `collections`, `custom-types`   | Return decode only for hello |
| map                         | `{ kind: "map", keyType, valueType }`   |        Yes | `collections`                            | No                           |
| tuple                       | `{ kind: "tuple", elements }`           |        Yes | `collections`                            | No                           |
| user-defined type reference | `{ kind: "custom", name }`              |        Yes | `custom-types`, error fixtures           | No                           |

Version 1 also normalizes these entry categories:

| Entry category      | Representation                                       | Deterministic fixture               |
| ------------------- | ---------------------------------------------------- | ----------------------------------- |
| Function            | `NormalizedContractFunction`                         | All five fixtures                   |
| Struct              | `NormalizedContractCustomType` with `kind: "struct"` | `custom-types`                      |
| Integer enum        | `NormalizedContractCustomType` with `kind: "enum"`   | `custom-types`                      |
| Unit/tuple union    | `NormalizedContractCustomType` with `kind: "union"`  | `custom-types`                      |
| Contract error enum | `NormalizedContractErrorEnum`                        | `collections`, `auth-events-errors` |
| Contract event      | `NormalizedContractSpecEvent`                        | `auth-events-errors`                |

Unknown spec type or entry discriminants fail explicitly with
`UNSUPPORTED_SPEC_TYPE` or `UNSUPPORTED_SPEC_ENTRY`; they are not silently omitted.

## Traceability

| Contract                         | Implementation                                               | Deterministic coverage                                        |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Version 1 model and functions    | `packages/stellar/src/contract-spec.ts`                      | `packages/stellar/src/contract-spec.test.ts`                  |
| Load endpoint                    | `apps/web/app/api/v1/playground/contracts/load/route.ts`     | `apps/web/features/playground/contract-loader.test.ts`        |
| Simulation, submission, status   | `apps/web/features/playground/server/transaction-service.ts` | `apps/web/features/playground/transaction-service.test.ts`    |
| Exact wallet-envelope comparison | `apps/web/features/playground/client-integrity.ts`           | `apps/web/features/playground/client-integrity.test.ts`       |
| Anonymous inspection UI          | `apps/web/features/playground/playground-client.tsx`         | `apps/web/features/playground/playground-ui.test.ts`          |
| Fixture type coverage            | `contracts/playground-fixtures/*/src/lib.rs`                 | `contracts/playground-fixtures/spec-fixtures/expected/*.json` |
