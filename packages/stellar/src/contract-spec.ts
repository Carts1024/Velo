import { createHash } from "node:crypto";

import { xdr } from "@stellar/stellar-sdk";

export type PlaygroundNetwork = "testnet" | "mainnet";
export type JsonSafeValue =
  | null
  | boolean
  | number
  | string
  | JsonSafeValue[]
  | { [key: string]: JsonSafeValue };

export type NormalizedContractSpecType =
  | {
      kind:
        | "value"
        | "bool"
        | "void"
        | "error"
        | "u32"
        | "i32"
        | "u64"
        | "i64"
        | "timepoint"
        | "duration"
        | "u128"
        | "i128"
        | "u256"
        | "i256"
        | "bytes"
        | "string"
        | "symbol"
        | "address"
        | "muxedAddress";
    }
  | { kind: "option"; valueType: NormalizedContractSpecType }
  | {
      kind: "result";
      okType: NormalizedContractSpecType;
      errorType: NormalizedContractSpecType;
    }
  | { kind: "vector"; elementType: NormalizedContractSpecType }
  | {
      kind: "map";
      keyType: NormalizedContractSpecType;
      valueType: NormalizedContractSpecType;
    }
  | { kind: "tuple"; elements: NormalizedContractSpecType[] }
  | { kind: "bytesN"; length: number }
  | { kind: "custom"; name: string };

export type ContractSpecSource = { index: number; xdr: string };
export type NormalizedContractParameter = {
  name: string;
  documentation: string;
  type: NormalizedContractSpecType;
};
export type NormalizedContractOutput = {
  index: number;
  type: NormalizedContractSpecType;
};
export type NormalizedContractFunction = {
  name: string;
  documentation: string;
  parameters: NormalizedContractParameter[];
  outputs: NormalizedContractOutput[];
  source: ContractSpecSource;
};
export type NormalizedContractCustomType =
  | {
      kind: "struct";
      name: string;
      library: string;
      documentation: string;
      fields: NormalizedContractParameter[];
      source: ContractSpecSource;
    }
  | {
      kind: "enum";
      name: string;
      library: string;
      documentation: string;
      cases: Array<{ name: string; documentation: string; value: number }>;
      source: ContractSpecSource;
    }
  | {
      kind: "union";
      name: string;
      library: string;
      documentation: string;
      cases: Array<{
        name: string;
        documentation: string;
        types: NormalizedContractSpecType[];
      }>;
      source: ContractSpecSource;
    };
export type NormalizedContractError = {
  name: string;
  documentation: string;
  value: number;
};
export type NormalizedContractErrorEnum = {
  name: string;
  library: string;
  documentation: string;
  cases: NormalizedContractError[];
  source: ContractSpecSource;
};
export type NormalizedContractSpecEvent = {
  name: string;
  library: string;
  documentation: string;
  prefixTopics: string[];
  dataFormat: string;
  parameters: Array<
    NormalizedContractParameter & {
      location: string;
    }
  >;
  source: ContractSpecSource;
};

export type ContractSpecDocumentV1 = {
  schemaVersion: 1;
  network: PlaygroundNetwork;
  contractId: string;
  wasmHash: string;
  specHash: string;
  latestLedger: number;
  loadedAt: string;
  correlationId: string;
  rawEntries: ContractSpecSource[];
  functions: NormalizedContractFunction[];
  customTypes: NormalizedContractCustomType[];
  errors: NormalizedContractErrorEnum[];
  events: NormalizedContractSpecEvent[];
};

export type ContractSpecStage =
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

export class ContractSpecError extends Error {
  readonly code: string;
  readonly stage: ContractSpecStage;
  readonly retryable: boolean;

  constructor(
    code: string,
    stage: ContractSpecStage,
    message: string,
    retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ContractSpecError";
    this.code = code;
    this.stage = stage;
    this.retryable = retryable;
  }
}

export function toJsonSafeContractValue(value: unknown, path = "$"): JsonSafeValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return {
      encoding: "base64",
      value: Buffer.from(value).toString("base64"),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => toJsonSafeContractValue(item, `${path}[${index}]`));
  }
  if (value instanceof Map) {
    return [...value.entries()].map(([key, item], index) => ({
      key: toJsonSafeContractValue(key, `${path}[${index}].key`),
      value: toJsonSafeContractValue(item, `${path}[${index}].value`),
    }));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        toJsonSafeContractValue(item, `${path}.${key}`),
      ]),
    );
  }
  throw new ContractSpecError(
    "UNSUPPORTED_CONTRACT_VALUE",
    "decode",
    `The decoded contract value at ${path} is not JSON-safe.`,
  );
}

type ContractSpecMetadata = Pick<
  ContractSpecDocumentV1,
  "network" | "contractId" | "wasmHash" | "latestLedger" | "loadedAt" | "correlationId"
>;

function text(value: string | Buffer) {
  return Buffer.isBuffer(value) ? value.toString("utf8") : value;
}

export function normalizeContractSpecType(
  definition: xdr.ScSpecTypeDef,
): NormalizedContractSpecType {
  const kind = definition.switch().name;
  const scalarKinds: Record<string, NormalizedContractSpecType["kind"]> = {
    scSpecTypeVal: "value",
    scSpecTypeBool: "bool",
    scSpecTypeVoid: "void",
    scSpecTypeError: "error",
    scSpecTypeU32: "u32",
    scSpecTypeI32: "i32",
    scSpecTypeU64: "u64",
    scSpecTypeI64: "i64",
    scSpecTypeTimepoint: "timepoint",
    scSpecTypeDuration: "duration",
    scSpecTypeU128: "u128",
    scSpecTypeI128: "i128",
    scSpecTypeU256: "u256",
    scSpecTypeI256: "i256",
    scSpecTypeBytes: "bytes",
    scSpecTypeString: "string",
    scSpecTypeSymbol: "symbol",
    scSpecTypeAddress: "address",
    scSpecTypeMuxedAddress: "muxedAddress",
  };
  const scalar = scalarKinds[kind];
  if (scalar) return { kind: scalar } as NormalizedContractSpecType;

  switch (kind) {
    case "scSpecTypeOption":
      return {
        kind: "option",
        valueType: normalizeContractSpecType(definition.option().valueType()),
      };
    case "scSpecTypeResult":
      return {
        kind: "result",
        okType: normalizeContractSpecType(definition.result().okType()),
        errorType: normalizeContractSpecType(definition.result().errorType()),
      };
    case "scSpecTypeVec":
      return {
        kind: "vector",
        elementType: normalizeContractSpecType(definition.vec().elementType()),
      };
    case "scSpecTypeMap":
      return {
        kind: "map",
        keyType: normalizeContractSpecType(definition.map().keyType()),
        valueType: normalizeContractSpecType(definition.map().valueType()),
      };
    case "scSpecTypeTuple":
      return {
        kind: "tuple",
        elements: definition.tuple().valueTypes().map(normalizeContractSpecType),
      };
    case "scSpecTypeBytesN":
      return { kind: "bytesN", length: definition.bytesN().n() };
    case "scSpecTypeUdt":
      return { kind: "custom", name: text(definition.udt().name()) };
    default:
      throw new ContractSpecError(
        "UNSUPPORTED_SPEC_TYPE",
        "normalize",
        `Unsupported contract specification type: ${kind}`,
      );
  }
}

export function computeContractSpecHash(entries: xdr.ScSpecEntry[]) {
  const hash = createHash("sha256");
  for (const entry of entries) {
    const bytes = entry.toXDR();
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    hash.update(length);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function source(entry: xdr.ScSpecEntry, index: number): ContractSpecSource {
  return { index, xdr: entry.toXDR("base64") };
}

function parameter(value: xdr.ScSpecFunctionInputV0 | xdr.ScSpecUdtStructFieldV0) {
  return {
    name: text(value.name()),
    documentation: text(value.doc()),
    type: normalizeContractSpecType(value.type()),
  };
}

export function normalizeContractSpec(
  entries: xdr.ScSpecEntry[],
  metadata: ContractSpecMetadata,
): ContractSpecDocumentV1 {
  try {
    const functions: NormalizedContractFunction[] = [];
    const customTypes: NormalizedContractCustomType[] = [];
    const errors: NormalizedContractErrorEnum[] = [];
    const events: NormalizedContractSpecEvent[] = [];
    const rawEntries = entries.map(source);

    entries.forEach((entry, index) => {
      const entryKind = entry.switch().name;
      const entrySource = rawEntries[index]!;
      switch (entryKind) {
        case "scSpecEntryFunctionV0": {
          const value = entry.functionV0();
          functions.push({
            name: text(value.name()),
            documentation: text(value.doc()),
            parameters: value.inputs().map(parameter),
            outputs: value.outputs().map((type, outputIndex) => ({
              index: outputIndex,
              type: normalizeContractSpecType(type),
            })),
            source: entrySource,
          });
          return;
        }
        case "scSpecEntryUdtStructV0": {
          const value = entry.udtStructV0();
          customTypes.push({
            kind: "struct",
            name: text(value.name()),
            library: text(value.lib()),
            documentation: text(value.doc()),
            fields: value.fields().map(parameter),
            source: entrySource,
          });
          return;
        }
        case "scSpecEntryUdtEnumV0": {
          const value = entry.udtEnumV0();
          customTypes.push({
            kind: "enum",
            name: text(value.name()),
            library: text(value.lib()),
            documentation: text(value.doc()),
            cases: value.cases().map((item) => ({
              name: text(item.name()),
              documentation: text(item.doc()),
              value: item.value(),
            })),
            source: entrySource,
          });
          return;
        }
        case "scSpecEntryUdtUnionV0": {
          const value = entry.udtUnionV0();
          customTypes.push({
            kind: "union",
            name: text(value.name()),
            library: text(value.lib()),
            documentation: text(value.doc()),
            cases: value.cases().map((item) => {
              const caseValue = item.value();
              const tuple = item.switch().name === "scSpecUdtUnionCaseTupleV0";
              return {
                name: text(caseValue.name()),
                documentation: text(caseValue.doc()),
                types: tuple
                  ? (caseValue as xdr.ScSpecUdtUnionCaseTupleV0)
                      .type()
                      .map(normalizeContractSpecType)
                  : [],
              };
            }),
            source: entrySource,
          });
          return;
        }
        case "scSpecEntryUdtErrorEnumV0": {
          const value = entry.udtErrorEnumV0();
          errors.push({
            name: text(value.name()),
            library: text(value.lib()),
            documentation: text(value.doc()),
            cases: value.cases().map((item) => ({
              name: text(item.name()),
              documentation: text(item.doc()),
              value: item.value(),
            })),
            source: entrySource,
          });
          return;
        }
        case "scSpecEntryEventV0": {
          const value = entry.eventV0();
          events.push({
            name: text(value.name()),
            library: text(value.lib()),
            documentation: text(value.doc()),
            prefixTopics: value.prefixTopics().map(text),
            dataFormat: value.dataFormat().name,
            parameters: value.params().map((item) => ({
              ...parameter(item),
              location: item.location().name,
            })),
            source: entrySource,
          });
          return;
        }
        default:
          throw new ContractSpecError(
            "UNSUPPORTED_SPEC_ENTRY",
            "normalize",
            `Unsupported contract specification entry: ${entryKind}`,
          );
      }
    });

    return {
      schemaVersion: 1,
      ...metadata,
      specHash: computeContractSpecHash(entries),
      rawEntries,
      functions,
      customTypes,
      errors,
      events,
    };
  } catch (error) {
    if (error instanceof ContractSpecError) throw error;
    throw new ContractSpecError(
      "MALFORMED_SPEC",
      "normalize",
      "The contract specification is malformed.",
      false,
      { cause: error },
    );
  }
}
