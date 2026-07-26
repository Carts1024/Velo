import assert from "node:assert/strict";
import test from "node:test";

import { xdr } from "@stellar/stellar-sdk";

import {
  ContractSpecError,
  computeContractSpecHash,
  normalizeContractSpec,
  normalizeContractSpecType,
  toJsonSafeContractValue,
} from "./contract-spec.ts";

const symbol = xdr.ScSpecTypeDef.scSpecTypeSymbol();
const vectorOfSymbol = xdr.ScSpecTypeDef.scSpecTypeVec(
  new xdr.ScSpecTypeVec({ elementType: symbol }),
);

function helloEntry() {
  return xdr.ScSpecEntry.scSpecEntryFunctionV0(
    new xdr.ScSpecFunctionV0({
      doc: "Return a greeting",
      name: "hello",
      inputs: [
        new xdr.ScSpecFunctionInputV0({
          doc: "Who to greet",
          name: "to",
          type: symbol,
        }),
      ],
      outputs: [vectorOfSymbol],
    }),
  );
}

test("normalizes functions without losing docs or source XDR", () => {
  const entry = helloEntry();
  const document = normalizeContractSpec([entry], {
    network: "testnet",
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    wasmHash: "ab".repeat(32),
    latestLedger: 123,
    loadedAt: "2026-07-23T00:00:00.000Z",
    correlationId: "corr-1",
  });

  assert.equal(document.schemaVersion, 1);
  assert.equal(document.functions[0]?.name, "hello");
  assert.equal(document.functions[0]?.documentation, "Return a greeting");
  assert.deepEqual(document.functions[0]?.parameters[0]?.type, { kind: "symbol" });
  assert.deepEqual(document.functions[0]?.outputs[0]?.type, {
    kind: "vector",
    elementType: { kind: "symbol" },
  });
  assert.deepEqual(document.functions[0]?.source, {
    index: 0,
    xdr: entry.toXDR("base64"),
  });
  assert.equal(document.specHash, computeContractSpecHash([entry]));
  assert.doesNotThrow(() => JSON.stringify(document));
});

test("normalizes recursive, fixed-byte, integer, time, and UDT types", () => {
  const tuple = xdr.ScSpecTypeDef.scSpecTypeTuple(
    new xdr.ScSpecTypeTuple({
      valueTypes: [
        xdr.ScSpecTypeDef.scSpecTypeI256(),
        xdr.ScSpecTypeDef.scSpecTypeBytesN(new xdr.ScSpecTypeBytesN({ n: 32 })),
        xdr.ScSpecTypeDef.scSpecTypeTimepoint(),
        xdr.ScSpecTypeDef.scSpecTypeDuration(),
      ],
    }),
  );
  const map = xdr.ScSpecTypeDef.scSpecTypeMap(
    new xdr.ScSpecTypeMap({
      keyType: xdr.ScSpecTypeDef.scSpecTypeString(),
      valueType: xdr.ScSpecTypeDef.scSpecTypeOption(
        new xdr.ScSpecTypeOption({
          valueType: xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name: "Person" })),
        }),
      ),
    }),
  );

  assert.deepEqual(normalizeContractSpecType(tuple), {
    kind: "tuple",
    elements: [
      { kind: "i256" },
      { kind: "bytesN", length: 32 },
      { kind: "timepoint" },
      { kind: "duration" },
    ],
  });
  assert.deepEqual(normalizeContractSpecType(map), {
    kind: "map",
    keyType: { kind: "string" },
    valueType: {
      kind: "option",
      valueType: { kind: "custom", name: "Person" },
    },
  });
});

test("spec hash is ordered and length-prefixed", () => {
  const first = helloEntry();
  const second = xdr.ScSpecEntry.scSpecEntryUdtEnumV0(
    new xdr.ScSpecUdtEnumV0({
      doc: "",
      lib: "",
      name: "Color",
      cases: [new xdr.ScSpecUdtEnumCaseV0({ doc: "", name: "Red", value: 1 })],
    }),
  );

  assert.notEqual(
    computeContractSpecHash([first, second]),
    computeContractSpecHash([second, first]),
  );
});

test("invalid entries fail with a typed normalization error", () => {
  assert.throws(
    () =>
      normalizeContractSpec([{} as xdr.ScSpecEntry], {
        network: "mainnet",
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        wasmHash: "ab".repeat(32),
        latestLedger: 1,
        loadedAt: "2026-07-23T00:00:00.000Z",
        correlationId: "corr-2",
      }),
    (error) =>
      error instanceof ContractSpecError &&
      error.code === "MALFORMED_SPEC" &&
      error.stage === "normalize",
  );
});

test("large integers, bytes, maps, and nested values become lossless JSON-safe values", () => {
  const value = toJsonSafeContractValue({
    amount: 2n ** 255n,
    bytes: Buffer.from([0, 1, 255]),
    map: new Map<unknown, unknown>([[1n, { ok: true }]]),
  });
  assert.deepEqual(value, {
    amount: (2n ** 255n).toString(),
    bytes: { encoding: "base64", value: "AAH/" },
    map: [{ key: "1", value: { ok: true } }],
  });
  assert.doesNotThrow(() => JSON.stringify(value));
});
