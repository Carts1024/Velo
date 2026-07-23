import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, StrKey, xdr } from "@stellar/stellar-sdk";

import type {
  ContractSpecDocumentV1,
  NormalizedContractFunction,
  NormalizedContractSpecType,
} from "./contract-spec.ts";

import {
  ARGUMENT_LIMITS,
  ArgumentValueError,
  classifyContractAddress,
  createArgumentExample,
  decodeArgumentValue,
  decodeFunctionArguments,
  encodeArgumentValue,
  encodeFunctionArguments,
  scValPreview,
  validateArgumentValue,
  validateFunctionArguments,
  type ArgumentSpecContext,
} from "./contract-arguments.ts";

const source = { index: 0, xdr: "" };
const customTypes: ArgumentSpecContext["customTypes"] = [
  {
    kind: "struct",
    name: "Person",
    library: "",
    documentation: "",
    fields: [
      { name: "name", documentation: "", type: { kind: "string" } },
      { name: "age", documentation: "", type: { kind: "u32" } },
    ],
    source,
  },
  {
    kind: "enum",
    name: "Color",
    library: "",
    documentation: "",
    cases: [
      { name: "Red", documentation: "", value: 1 },
      { name: "Blue", documentation: "", value: 2 },
    ],
    source,
  },
  {
    kind: "union",
    name: "Shape",
    library: "",
    documentation: "",
    cases: [
      { name: "Unit", documentation: "", types: [] },
      { name: "Circle", documentation: "", types: [{ kind: "u32" }] },
    ],
    source,
  },
];
const context: ArgumentSpecContext = {
  customTypes,
  errors: [
    {
      name: "ContractError",
      library: "",
      documentation: "",
      cases: [{ name: "Denied", documentation: "", value: 7 }],
      source,
    },
  ],
};

const account = Keypair.random().publicKey();
const contract = StrKey.encodeContract(Keypair.random().rawPublicKey());

const matrix: Array<[string, NormalizedContractSpecType, unknown]> = [
  ["bool", { kind: "bool" }, true],
  ["void", { kind: "void" }, null],
  ["u32", { kind: "u32" }, "4294967295"],
  ["i32", { kind: "i32" }, "-2147483648"],
  ["u64", { kind: "u64" }, "18446744073709551615"],
  ["i64", { kind: "i64" }, "-9223372036854775808"],
  ["u128", { kind: "u128" }, (2n ** 128n - 1n).toString()],
  ["i128", { kind: "i128" }, (-(2n ** 127n)).toString()],
  ["u256", { kind: "u256" }, (2n ** 256n - 1n).toString()],
  ["i256", { kind: "i256" }, (-(2n ** 255n)).toString()],
  ["timepoint", { kind: "timepoint" }, "18446744073709551615"],
  ["duration", { kind: "duration" }, "42"],
  ["string", { kind: "string" }, "hello"],
  ["symbol", { kind: "symbol" }, "hello_1"],
  ["bytes", { kind: "bytes" }, { encoding: "base64", value: "AAH/" }],
  ["bytesN", { kind: "bytesN", length: 3 }, { encoding: "base64", value: "AAH/" }],
  ["address/account", { kind: "address" }, account],
  ["address/contract", { kind: "address" }, contract],
  ["option/some", { kind: "option", valueType: { kind: "u64" } }, "9007199254740993"],
  ["option/none", { kind: "option", valueType: { kind: "string" } }, null],
  [
    "result/ok",
    { kind: "result", okType: { kind: "u64" }, errorType: { kind: "error" } },
    { status: "ok", value: "9" },
  ],
  [
    "result/error",
    { kind: "result", okType: { kind: "u64" }, errorType: { kind: "error" } },
    { status: "error", value: { type: "ContractError", case: "Denied" } },
  ],
  ["vector", { kind: "vector", elementType: { kind: "u32" } }, ["1", "2"]],
  [
    "map",
    { kind: "map", keyType: { kind: "u32" }, valueType: { kind: "string" } },
    [
      { key: "1", value: "one" },
      { key: "2", value: "two" },
    ],
  ],
  ["tuple", { kind: "tuple", elements: [{ kind: "bool" }, { kind: "i64" }] }, [false, "-9"]],
  ["struct", { kind: "custom", name: "Person" }, { name: "Ada", age: "36" }],
  ["enum", { kind: "custom", name: "Color" }, { case: "Blue" }],
  ["union", { kind: "custom", name: "Shape" }, { case: "Circle", values: ["4"] }],
  ["error", { kind: "error" }, { type: "ContractError", case: "Denied" }],
  [
    "named error enum",
    { kind: "custom", name: "ContractError" },
    { type: "ContractError", case: "Denied" },
  ],
];

for (const [name, type, value] of matrix) {
  test(`${name} validates and round-trips through ScVal`, () => {
    assert.deepEqual(validateArgumentValue(type, value, context), []);
    const encoded = encodeArgumentValue(type, value, context);
    assert.deepEqual(decodeArgumentValue(type, encoded, context), value);
    assert.equal(scValPreview(type, value, context), encoded.toXDR("base64"));
  });
}

test("examples are valid for every interactive type and inspection-only types are explicit", () => {
  for (const [, type] of matrix) {
    assert.deepEqual(
      validateArgumentValue(type, createArgumentExample(type, context), context),
      [],
    );
  }
  for (const kind of ["value", "muxedAddress"] as const) {
    const issues = validateArgumentValue({ kind }, null, context);
    assert.equal(issues[0]?.code, "inspection_only");
  }
});

test("integer validation rejects numbers, syntax, and exact signed/unsigned boundaries", () => {
  assert.equal(validateArgumentValue({ kind: "u64" }, 1, context)[0]?.code, "type");
  assert.equal(validateArgumentValue({ kind: "u32" }, "01", context)[0]?.path, "$");
  assert.equal(validateArgumentValue({ kind: "u32" }, "-1", context)[0]?.code, "range");
  assert.equal(validateArgumentValue({ kind: "i32" }, "2147483648", context)[0]?.code, "range");
});

test("bytes are strictly tagged base64 and bounded by decoded length", () => {
  assert.equal(validateArgumentValue({ kind: "bytes" }, "AA==", context)[0]?.code, "type");
  assert.equal(
    validateArgumentValue({ kind: "bytes" }, { encoding: "base64", value: "%%%=" }, context)[0]
      ?.code,
    "base64",
  );
  const oversized = { encoding: "base64", value: "A".repeat(87_384) };
  assert.equal(
    validateArgumentValue({ kind: "bytes" }, oversized, context)[0]?.code,
    "bytes_limit",
  );
});

test("validation reports exact nested paths and limits depth, collections, and JSON payloads", () => {
  const nestedType: NormalizedContractSpecType = {
    kind: "vector",
    elementType: { kind: "custom", name: "Person" },
  };
  assert.equal(
    validateArgumentValue(nestedType, [{ name: "Ada", age: "-1" }], context)[0]?.path,
    "$[0].age",
  );
  assert.equal(
    validateArgumentValue(
      { kind: "vector", elementType: { kind: "bool" } },
      Array.from({ length: ARGUMENT_LIMITS.collectionEntries + 1 }, () => true),
      context,
    )[0]?.code,
    "collection_limit",
  );
  let type: NormalizedContractSpecType = { kind: "bool" };
  let value: unknown = true;
  for (let index = 0; index <= ARGUMENT_LIMITS.depth; index += 1) {
    type = { kind: "vector", elementType: type };
    value = [value];
  }
  assert.equal(validateArgumentValue(type, value, context)[0]?.code, "depth_limit");
  assert.equal(
    validateArgumentValue({ kind: "string" }, "x".repeat(ARGUMENT_LIMITS.jsonBytes), context)[0]
      ?.code,
    "payload_limit",
  );
});

test("safety limits cannot be raised through a caller-provided context property", () => {
  const attemptedOverride = {
    ...context,
    limits: { collectionEntries: 1_000, depth: 1_000 },
  } as ArgumentSpecContext;
  assert.equal(
    validateArgumentValue(
      { kind: "vector", elementType: { kind: "bool" } },
      Array.from({ length: ARGUMENT_LIMITS.collectionEntries + 1 }, () => true),
      attemptedOverride,
    )[0]?.code,
    "collection_limit",
  );
});

test("encoded duplicate map keys are rejected at the second key path", () => {
  assert.throws(
    () =>
      encodeArgumentValue(
        { kind: "map", keyType: { kind: "u32" }, valueType: { kind: "bool" } },
        [
          { key: "1", value: true },
          { key: "1", value: false },
        ],
        context,
      ),
    (error) =>
      error instanceof ArgumentValueError &&
      error.issues.some((issue) => issue.path === "$[1].key" && issue.code === "duplicate_key"),
  );
});

test("address classification distinguishes accounts and contracts", () => {
  assert.equal(classifyContractAddress(account), "account");
  assert.equal(classifyContractAddress(contract), "contract");
  assert.equal(classifyContractAddress("not-an-address"), "invalid");
});

test("function helpers preserve parameter order and exact parameter paths", () => {
  const fn: NormalizedContractFunction = {
    name: "transfer",
    documentation: "",
    parameters: [
      { name: "to", documentation: "", type: { kind: "address" } },
      { name: "amount", documentation: "", type: { kind: "u128" } },
    ],
    outputs: [],
    source,
  };
  assert.deepEqual(
    validateFunctionArguments(fn, { to: account, amount: "-1" }, context)[0]?.path,
    "$.amount",
  );
  const encoded = encodeFunctionArguments(fn, { to: account, amount: "9" }, context);
  assert.equal(encoded.length, 2);
  assert.equal(encoded[1]?.switch().name, "scvU128");
  assert.deepEqual(decodeFunctionArguments(fn, encoded, context), { to: account, amount: "9" });
});

test("function helpers reject unknown keys and enforce payload size across the full object", () => {
  const fn: NormalizedContractFunction = {
    name: "empty",
    documentation: "",
    parameters: [],
    outputs: [],
    source,
  };
  assert.equal(validateFunctionArguments(fn, { surprise: true }, context)[0]?.code, "unknown_key");
  assert.equal(
    validateFunctionArguments(
      {
        ...fn,
        parameters: [{ name: "text", documentation: "", type: { kind: "string" } }],
      },
      { text: "x".repeat(ARGUMENT_LIMITS.jsonBytes) },
      context,
    )[0]?.code,
    "payload_limit",
  );
});

test("decoder rejects an ScVal that does not match the declared type", () => {
  assert.throws(
    () => decodeArgumentValue({ kind: "bool" }, xdr.ScVal.scvString("wrong"), context),
    ArgumentValueError,
  );
});

test("decoder wraps malformed empty custom union and struct ScVals", () => {
  assert.throws(
    () => decodeArgumentValue({ kind: "custom", name: "Shape" }, xdr.ScVal.scvVec([]), context),
    ArgumentValueError,
  );
  assert.throws(
    () => decodeArgumentValue({ kind: "custom", name: "Person" }, xdr.ScVal.scvMap([]), context),
    ArgumentValueError,
  );
});

test("document context resolves custom and error enums", () => {
  const document = {
    customTypes,
    errors: context.errors,
  } as ContractSpecDocumentV1;
  assert.deepEqual(createArgumentExample({ kind: "custom", name: "Color" }, document), {
    case: "Red",
  });
});
