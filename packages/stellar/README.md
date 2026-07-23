# `@repo/stellar`

Private workspace package for Stellar transaction, validation, registry, event, and
Soroban contract-spec utilities used by Velo.

## Sprint 1 contract-spec API

The package root exports the versioned `ContractSpecDocumentV1` model and helpers:

```ts
import {
  computeContractSpecHash,
  ContractSpecError,
  normalizeContractSpec,
  normalizeContractSpecType,
  toJsonSafeContractValue,
  type ContractSpecDocumentV1,
  type NormalizedContractSpecType,
} from "@repo/stellar";
```

`ContractSpecDocumentV1.schemaVersion` is always `1`. The document contains network,
contract ID, Wasm/spec hashes, ledger/load metadata, correlation ID, ordered source
entry XDR, functions, custom types, errors, and events.

The normalizer supports scalar, option, result, vector, map, tuple, fixed bytes, and
user-defined type references. Unsupported spec types or entries fail explicitly;
they are not omitted.

`toJsonSafeContractValue` converts large integers to decimal strings, bytes to a
base64 object, maps to key/value arrays, and recursively preserves arrays and plain
objects.

See the
[Sprint 1 API and type-support reference](../../docs/references/sprint-1-playground-api-and-type-support.md)
for the complete public surface, version 1 type matrix, and JSON-safe value rules.
The architecture and trust boundaries are in the
[Sprint 1 architecture record](../../docs/architecture/sprint-1-playground-contract-spec-foundation.md).

## Sprint 2 dynamic argument API

The package root and `@repo/stellar/contract-arguments` subpath export the canonical
argument model:

```ts
import {
  ARGUMENT_LIMITS,
  ArgumentValueError,
  argumentCustomType,
  argumentErrorEnums,
  classifyContractAddress,
  createArgumentExample,
  createFunctionArgumentExamples,
  decodeArgumentValue,
  decodeFunctionArguments,
  encodeArgumentValue,
  encodeFunctionArguments,
  scValPreview,
  validateArgumentValue,
  validateFunctionArguments,
  type ArgumentLimits,
  type ArgumentSpecContext,
  type ArgumentValidationIssue,
  type CanonicalArgumentValue,
  type ContractAddressClassification,
  type TaggedBytesValue,
} from "@repo/stellar";
```

Function values are objects keyed by parameter name. Integers, timepoints, and
durations remain decimal strings; bytes use
`{ "encoding": "base64", "value": "..." }`; maps use ordered `{ key, value }`
arrays; and custom structs, enums, unions, and named errors resolve from the
normalized contract document. `value` and `muxedAddress` are inspection-only.

Validation returns exact `{ path, code, message }` issues. Encoding throws
`ArgumentValueError` for invalid values, including duplicate keys after `ScVal`
encoding. The fixed limits are depth 8, 100 collection entries, 64 KiB decoded
bytes, and 256 KiB serialized canonical JSON.

See the
[Sprint 2 dynamic argument reference](../../docs/architecture/sprint-2-playground-dynamic-argument-system.md)
for canonical JSON examples, public API behavior, editor synchronization, preview
format, and the Sprint 3 boundary.

## Verify

From the repository root:

```bash
pnpm --filter @repo/stellar test
```

The verified Sprint 2 package suite contains 78 tests. Sprint 2 status:
**IMPLEMENTED AND TESTED**.

Fixture snapshot qualification also requires building the isolated
`contracts/playground-fixtures` Cargo workspace; follow the
[fixture runbook](../../docs/operations/sprint-1-playground-fixture-runbook.md).

Sprint 1 status: **IMPLEMENTED — LIVE EVIDENCE PENDING**. Deterministic package and
fixture tests do not constitute a live Testnet wallet run.
