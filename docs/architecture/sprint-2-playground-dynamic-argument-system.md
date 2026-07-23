# Sprint 2 Playground dynamic argument system

Status: **IMPLEMENTED AND TESTED**  
Applies to: Velo Playground Sprint 2 (PG-201–PG-204)  
Audience: frontend developers, `@repo/stellar` consumers, and test authors  
Last reviewed: 2026-07-23

Sprint 2 adds a spec-driven argument model and recursive editor without changing the
Playground HTTP API or its narrow Testnet transaction path. A selected function's
arguments are represented as one object keyed by parameter name. That same canonical
object drives Form mode, JSON mode, validation, `ScVal` encoding, and typed decoding.

Generalized simulation is not part of Sprint 2. The existing Testnet
`hello(Symbol)` service still accepts its original `argument: string` request and
remains the only simulation, signing, and submission path. Arbitrary arguments
prepared by the editor become simulation inputs in Sprint 3.

## Canonical argument model

Given parameters named `owner`, `amount`, and `memo`, the function-level value is:

```json
{
  "owner": "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  "amount": "9007199254740993",
  "memo": null
}
```

The canonical shapes are:

| Spec type | Canonical JSON |
| --- | --- |
| `bool` | JSON boolean |
| `void` | `null` |
| `u32`, `i32`, `u64`, `i64`, `u128`, `i128`, `u256`, `i256` | Canonical decimal string |
| `timepoint`, `duration` | Unsigned decimal string |
| `string`, `symbol`, `address` | JSON string |
| `bytes`, `bytesN` | `{ "encoding": "base64", "value": "..." }` |
| `option<T>` | `null` for none, otherwise the canonical `T` value |
| `result<T, E>` | `{ "status": "ok" \| "error", "value": ... }` |
| vector, tuple | JSON array |
| map | Ordered `{ "key": ..., "value": ... }[]` |
| struct | Object keyed by field name |
| integer enum | `{ "case": "CaseName" }` |
| union | `{ "case": "CaseName", "values": [...] }` |
| contract error | `{ "type": "ErrorEnumName", "case": "CaseName" }` |

Integer strings use `0` or an optional minus sign followed by a non-zero digit and
digits. Leading zeroes, `-0`, decimal points, exponent notation, JSON numbers, and
values outside the declared integer range are rejected. Symbols contain 1–32 ASCII
letters, digits, or underscores. Fixed bytes must decode to exactly the declared
length.

Custom references resolve against both `customTypes` and named contract error enums
from `ContractSpecDocumentV1`. Unknown definitions and variants fail explicitly.
The normalized `value` and `muxedAddress` kinds remain inspection-only: examples
return `null`, while validation and encoding report `inspection_only`.

## Validation and encoding

`validateArgumentValue` and `validateFunctionArguments` return issues without
throwing:

```ts
type ArgumentValidationIssue = {
  path: string;
  code: string;
  message: string;
};
```

Paths start at `$`, use parameter or field names such as `$.amount` and
`$.profile.name`, and use indexes such as `$.items[2].key`. Encoding and decoding
failures throw `ArgumentValueError`, which exposes the same `issues` array.

The fixed safety limits are:

| Limit | Value |
| --- | ---: |
| Nested value depth | 8 |
| Entries in a vector or map | 100 |
| Decoded bytes per byte value | 65,536 bytes |
| Serialized canonical JSON | 262,144 bytes |

Maps retain the user's ordered array in canonical JSON. Encoding converts keys to
`ScVal`, rejects a duplicate at the second key's exact path, and sorts encoded map
entries into canonical XDR order. This means keys that look different in JSON but
encode identically are duplicates.

The package exposes both value-level and function-level operations:

```ts
import {
  ARGUMENT_LIMITS,
  ArgumentValueError,
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
  type ArgumentSpecContext,
  type ArgumentValidationIssue,
  type CanonicalArgumentValue,
} from "@repo/stellar";

const context = {
  customTypes: contract.customTypes,
  errors: contract.errors,
};

const values = createFunctionArgumentExamples(functionSpec, context);
const issues = validateFunctionArguments(functionSpec, values, context);

if (issues.length === 0) {
  const encoded = encodeFunctionArguments(functionSpec, values, context);
  const decoded = decodeFunctionArguments(functionSpec, encoded, context);
}
```

`encodeFunctionArguments` preserves specification parameter order and returns one
`ScVal` per parameter. `scValPreview` returns base64 XDR for one value. The
Playground preview renders a read-only JSON object keyed by parameter name, with
each value containing that parameter's base64 `ScVal` XDR.

## Playground state and accessibility

Each function receives type-derived examples on first selection. Drafts are retained
by function name while switching between functions and are cleared when another
contract is loaded.

Form and JSON modes distinguish editable drafts from the last valid canonical value:

- a valid Form or JSON change replaces the canonical value and synchronizes the
  other mode;
- invalid JSON remains in the JSON textarea and preserves the prior Form and
  canonical values;
- schema-invalid JSON and invalid Form fields remain editable, preserve the last
  valid canonical value, and expose exact-path issues;
- any JSON or validation error suppresses the encoded preview;
- reset rebuilds type-derived examples, and copy writes the last valid canonical
  object as formatted JSON.

Vectors and maps provide add, remove, move-up, and move-down buttons. Buttons have
explicit accessible names, disabled boundary states, and a 100-entry cap. Form/JSON
mode buttons expose pressed state, errors use alert semantics, and copy completion
uses a polite live region. Address controls classify valid values as `account` or
`contract` and report invalid addresses at the field path.

## Verification and boundaries

Sprint 2 is covered by 78 `@repo/stellar` tests and 110 web tests. The argument
matrix exercises examples, validation, encoding, decoding, and canonical
value-to-`ScVal` round trips for every interactive type, including large-integer
boundaries, bytes, addresses, composite/custom values, errors, limits, duplicate
encoded map keys, and malformed typed XDR. Web tests cover last-valid draft behavior,
precision preservation, preview suppression, function retention/reset wiring, and
accessible controls.

The package typecheck, web typecheck, production web build, and Playground fixture
Cargo tests also pass. No new live Testnet transaction is required for Sprint 2;
Sprint 1's interactive-wallet evidence remains pending.

Source of truth:

- argument model and public API: `packages/stellar/src/contract-arguments.ts`;
- editor state and UI: `apps/web/features/playground/argument-editor-state.ts` and
  `apps/web/features/playground/argument-editor.tsx`;
- integration boundary: `apps/web/features/playground/playground-client.tsx`;
- tests: `packages/stellar/src/contract-arguments.test.ts` and
  `apps/web/features/playground/*argument*.test.ts`.

For the earlier inspection and allowlisted transaction boundaries, see the
[Sprint 1 architecture](sprint-1-playground-contract-spec-foundation.md) and
[Sprint 1 API/type reference](../references/sprint-1-playground-api-and-type-support.md).
