import { Address, XdrLargeInt, scValToBigInt, xdr } from "@stellar/stellar-sdk";

import type {
  ContractSpecDocumentV1,
  NormalizedContractCustomType,
  NormalizedContractErrorEnum,
  NormalizedContractFunction,
  NormalizedContractSpecType,
} from "./contract-spec.ts";

export const ARGUMENT_LIMITS = Object.freeze({
  depth: 8,
  collectionEntries: 100,
  decodedBytes: 64 * 1024,
  jsonBytes: 256 * 1024,
});

export type CanonicalArgumentValue =
  | null
  | boolean
  | string
  | CanonicalArgumentValue[]
  | { [key: string]: CanonicalArgumentValue };

export type TaggedBytesValue = { encoding: "base64"; value: string };
export type ArgumentValidationIssue = {
  path: string;
  code: string;
  message: string;
};
export type ArgumentLimits = typeof ARGUMENT_LIMITS;
export type ArgumentSpecContext = Pick<ContractSpecDocumentV1, "customTypes" | "errors">;
export type ContractAddressClassification = "account" | "contract" | "invalid";

export class ArgumentValueError extends Error {
  readonly issues: ArgumentValidationIssue[];

  constructor(issues: ArgumentValidationIssue[]) {
    super(issues[0]?.message ?? "The contract argument is invalid.");
    this.name = "ArgumentValueError";
    this.issues = issues;
  }
}

type ResolvedLimits = {
  depth: number;
  collectionEntries: number;
  decodedBytes: number;
  jsonBytes: number;
};

function limits(): ResolvedLimits {
  return { ...ARGUMENT_LIMITS };
}

function issue(path: string, code: string, message: string): ArgumentValidationIssue {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fieldPath(path: string, field: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(field)
    ? `${path}.${field}`
    : `${path}[${JSON.stringify(field)}]`;
}

function utf8Size(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function decodeBase64(value: string): Uint8Array | null {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return null;
  }
  try {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function encodeBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function taggedBytes(value: unknown): value is TaggedBytesValue {
  return (
    isRecord(value) &&
    value.encoding === "base64" &&
    typeof value.value === "string" &&
    Object.keys(value).length === 2
  );
}

function customType(context: ArgumentSpecContext, name: string) {
  return context.customTypes.find((item) => item.name === name);
}

function namedError(context: ArgumentSpecContext, name: string) {
  return context.errors.find((item) => item.name === name);
}

function integerBounds(kind: NormalizedContractSpecType["kind"]): [bigint, bigint] | null {
  switch (kind) {
    case "u32":
      return [0n, 2n ** 32n - 1n];
    case "i32":
      return [-(2n ** 31n), 2n ** 31n - 1n];
    case "u64":
    case "timepoint":
    case "duration":
      return [0n, 2n ** 64n - 1n];
    case "i64":
      return [-(2n ** 63n), 2n ** 63n - 1n];
    case "u128":
      return [0n, 2n ** 128n - 1n];
    case "i128":
      return [-(2n ** 127n), 2n ** 127n - 1n];
    case "u256":
      return [0n, 2n ** 256n - 1n];
    case "i256":
      return [-(2n ** 255n), 2n ** 255n - 1n];
    default:
      return null;
  }
}

function validateInteger(kind: NormalizedContractSpecType["kind"], value: unknown, path: string) {
  if (typeof value !== "string") {
    return [issue(path, "type", `${kind} must be a decimal string.`)];
  }
  if (!/^(?:0|-?[1-9][0-9]*)$/.test(value)) {
    return [issue(path, "integer", `${kind} must be a canonical decimal string.`)];
  }
  const [minimum, maximum] = integerBounds(kind)!;
  const integer = BigInt(value);
  return integer < minimum || integer > maximum
    ? [issue(path, "range", `${kind} is outside ${minimum} through ${maximum}.`)]
    : [];
}

function validateBytes(
  type: NormalizedContractSpecType,
  value: unknown,
  path: string,
  maxBytes: number,
) {
  if (!taggedBytes(value)) {
    return [
      issue(path, "type", 'Bytes must use the tagged shape {"encoding":"base64","value":"..."}.'),
    ];
  }
  const bytes = decodeBase64(value.value);
  if (!bytes) return [issue(fieldPath(path, "value"), "base64", "Bytes contain invalid base64.")];
  if (bytes.byteLength > maxBytes) {
    return [issue(path, "bytes_limit", `Decoded bytes exceed the ${maxBytes}-byte limit.`)];
  }
  if (type.kind === "bytesN" && bytes.byteLength !== type.length) {
    return [issue(path, "fixed_bytes", `Expected exactly ${type.length} decoded bytes.`)];
  }
  return [];
}

export function classifyContractAddress(value: string): ContractAddressClassification {
  try {
    const kind = Address.fromString(value).toScAddress().switch().name;
    if (kind === "scAddressTypeAccount") return "account";
    if (kind === "scAddressTypeContract") return "contract";
    return "invalid";
  } catch {
    return "invalid";
  }
}

function validateCore(
  type: NormalizedContractSpecType,
  value: unknown,
  context: ArgumentSpecContext,
  path: string,
  depth: number,
  resolved: ResolvedLimits,
  customStack: string[],
): ArgumentValidationIssue[] {
  if (depth > resolved.depth) {
    return [issue(path, "depth_limit", `Nesting exceeds the depth limit of ${resolved.depth}.`)];
  }
  if (integerBounds(type.kind)) return validateInteger(type.kind, value, path);

  switch (type.kind) {
    case "value":
    case "muxedAddress":
      return [
        issue(
          path,
          "inspection_only",
          `${type.kind} is available for inspection only in Sprint 2.`,
        ),
      ];
    case "bool":
      return typeof value === "boolean" ? [] : [issue(path, "type", "Expected a boolean.")];
    case "void":
      return value === null ? [] : [issue(path, "type", "Void must be null.")];
    case "string":
      return typeof value === "string" ? [] : [issue(path, "type", "Expected a string.")];
    case "symbol":
      return typeof value !== "string"
        ? [issue(path, "type", "Expected a symbol string.")]
        : /^[A-Za-z0-9_]{1,32}$/.test(value)
          ? []
          : [issue(path, "symbol", "Symbols must contain 1–32 ASCII letters, digits, or _.")];
    case "bytes":
    case "bytesN":
      return validateBytes(type, value, path, resolved.decodedBytes);
    case "address": {
      const classification = typeof value === "string" ? classifyContractAddress(value) : "invalid";
      return classification === "invalid"
        ? [issue(path, "address", "Expected a valid Stellar account or contract address.")]
        : [];
    }
    case "error": {
      if (!isRecord(value) || typeof value.type !== "string" || typeof value.case !== "string") {
        return [issue(path, "type", 'Errors use {"type":"ErrorEnum","case":"CaseName"}.')];
      }
      const errorEnum = context.errors.find((item) => item.name === value.type);
      if (!errorEnum) {
        return [issue(fieldPath(path, "type"), "error_enum", `Unknown error enum ${value.type}.`)];
      }
      return errorEnum.cases.some((item) => item.name === value.case)
        ? []
        : [issue(fieldPath(path, "case"), "variant", `Unknown ${value.type} error case.`)];
    }
    case "option": {
      return value === null
        ? []
        : validateCore(type.valueType, value, context, path, depth + 1, resolved, customStack);
    }
    case "result": {
      if (!isRecord(value) || (value.status !== "ok" && value.status !== "error")) {
        return [issue(path, "type", 'Results use {"status":"ok|error","value":...}.')];
      }
      return validateCore(
        value.status === "ok" ? type.okType : type.errorType,
        value.value,
        context,
        fieldPath(path, "value"),
        depth + 1,
        resolved,
        customStack,
      );
    }
    case "vector": {
      if (!Array.isArray(value)) return [issue(path, "type", "Expected an array.")];
      if (value.length > resolved.collectionEntries) {
        return [
          issue(
            path,
            "collection_limit",
            `Collection exceeds ${resolved.collectionEntries} entries.`,
          ),
        ];
      }
      return value.flatMap((item, index) =>
        validateCore(
          type.elementType,
          item,
          context,
          `${path}[${index}]`,
          depth + 1,
          resolved,
          customStack,
        ),
      );
    }
    case "map": {
      if (!Array.isArray(value)) {
        return [issue(path, "type", "Maps must be an array of {key,value} entries.")];
      }
      if (value.length > resolved.collectionEntries) {
        return [
          issue(path, "collection_limit", `Map exceeds ${resolved.collectionEntries} entries.`),
        ];
      }
      return value.flatMap((entry, index) => {
        if (!isRecord(entry)) return [issue(`${path}[${index}]`, "type", "Expected a map entry.")];
        return [
          ...validateCore(
            type.keyType,
            entry.key,
            context,
            `${path}[${index}].key`,
            depth + 1,
            resolved,
            customStack,
          ),
          ...validateCore(
            type.valueType,
            entry.value,
            context,
            `${path}[${index}].value`,
            depth + 1,
            resolved,
            customStack,
          ),
        ];
      });
    }
    case "tuple": {
      if (!Array.isArray(value) || value.length !== type.elements.length) {
        return [issue(path, "tuple_length", `Expected a ${type.elements.length}-item tuple.`)];
      }
      return type.elements.flatMap((element, index) =>
        validateCore(
          element,
          value[index],
          context,
          `${path}[${index}]`,
          depth + 1,
          resolved,
          customStack,
        ),
      );
    }
    case "custom":
      return validateCustom(type.name, value, context, path, depth, resolved, customStack);
  }
  return [issue(path, "unsupported_type", "Unsupported contract specification type.")];
}

function validateCustom(
  name: string,
  value: unknown,
  context: ArgumentSpecContext,
  path: string,
  depth: number,
  resolved: ResolvedLimits,
  customStack: string[],
): ArgumentValidationIssue[] {
  const definition = customType(context, name);
  const errorDefinition = namedError(context, name);
  if (!definition && !errorDefinition) {
    return [issue(path, "custom_type", `Unknown custom type ${name}.`)];
  }
  if (errorDefinition) {
    if (!isRecord(value) || value.type !== errorDefinition.name || typeof value.case !== "string") {
      return [issue(path, "type", `Error ${name} uses {"type":"${name}","case":"CaseName"}.`)];
    }
    return errorDefinition.cases.some((item) => item.name === value.case)
      ? []
      : [issue(fieldPath(path, "case"), "variant", `Unknown ${name} error case.`)];
  }
  if (!definition) return [issue(path, "custom_type", `Unknown custom type ${name}.`)];
  if (customStack.filter((item) => item === name).length > resolved.depth) {
    return [issue(path, "depth_limit", `Custom type recursion exceeds ${resolved.depth}.`)];
  }
  const nextStack = [...customStack, name];
  if (definition.kind === "enum") {
    if (!isRecord(value) || typeof value.case !== "string") {
      return [issue(path, "type", `Enum ${name} uses {"case":"CaseName"}.`)];
    }
    return definition.cases.some((item) => item.name === value.case)
      ? []
      : [issue(fieldPath(path, "case"), "variant", `Unknown ${name} enum case.`)];
  }
  if (definition.kind === "union") {
    if (!isRecord(value) || typeof value.case !== "string" || !Array.isArray(value.values)) {
      return [issue(path, "type", `Union ${name} uses {"case":"CaseName","values":[]}.`)];
    }
    const selected = definition.cases.find((item) => item.name === value.case);
    if (!selected) {
      return [issue(fieldPath(path, "case"), "variant", `Unknown ${name} union case.`)];
    }
    const values = value.values as unknown[];
    if (values.length !== selected.types.length) {
      return [
        issue(
          fieldPath(path, "values"),
          "tuple_length",
          `${selected.name} expects ${selected.types.length} values.`,
        ),
      ];
    }
    return selected.types.flatMap((item, index) =>
      validateCore(
        item,
        values[index],
        context,
        `${fieldPath(path, "values")}[${index}]`,
        depth + 1,
        resolved,
        nextStack,
      ),
    );
  }
  if (!isRecord(value)) return [issue(path, "type", `Struct ${name} must be an object.`)];
  return definition.fields.flatMap((field) =>
    validateCore(
      field.type,
      value[field.name],
      context,
      fieldPath(path, field.name),
      depth + 1,
      resolved,
      nextStack,
    ),
  );
}

export function validateArgumentValue(
  type: NormalizedContractSpecType,
  value: unknown,
  context: ArgumentSpecContext,
  path = "$",
): ArgumentValidationIssue[] {
  const resolved = limits();
  if (utf8Size(value) > resolved.jsonBytes) {
    return [
      issue(path, "payload_limit", `Canonical JSON exceeds the ${resolved.jsonBytes}-byte limit.`),
    ];
  }
  return validateCore(type, value, context, path, 0, resolved, []);
}

function zeroBytes(length: number): TaggedBytesValue {
  return { encoding: "base64", value: encodeBase64(new Uint8Array(length)) };
}

export function createArgumentExample(
  type: NormalizedContractSpecType,
  context: ArgumentSpecContext,
  depth = 0,
): CanonicalArgumentValue {
  if (depth > limits().depth) return null;
  if (integerBounds(type.kind)) return "0";
  switch (type.kind) {
    case "bool":
      return false;
    case "void":
      return null;
    case "string":
      return "";
    case "symbol":
      return "value";
    case "bytes":
      return zeroBytes(0);
    case "bytesN":
      return zeroBytes(type.length);
    case "address":
      return "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    case "error": {
      const errorEnum = context.errors[0];
      return errorEnum?.cases[0] ? { type: errorEnum.name, case: errorEnum.cases[0].name } : null;
    }
    case "option":
      return null;
    case "result":
      return {
        status: "ok",
        value: createArgumentExample(type.okType, context, depth + 1),
      };
    case "vector":
    case "map":
      return [];
    case "tuple":
      return type.elements.map((item) => createArgumentExample(item, context, depth + 1));
    case "custom": {
      const definition = customType(context, type.name);
      const errorDefinition = namedError(context, type.name);
      if (errorDefinition?.cases[0]) {
        return { type: errorDefinition.name, case: errorDefinition.cases[0].name };
      }
      if (!definition) return null;
      if (definition.kind === "enum") return { case: definition.cases[0]?.name ?? "" };
      if (definition.kind === "union") {
        const selected = definition.cases[0];
        return {
          case: selected?.name ?? "",
          values:
            selected?.types.map((item) => createArgumentExample(item, context, depth + 1)) ?? [],
        };
      }
      return Object.fromEntries(
        definition.fields.map((field) => [
          field.name,
          createArgumentExample(field.type, context, depth + 1),
        ]),
      ) as CanonicalArgumentValue;
    }
    case "value":
    case "muxedAddress":
      return null;
  }
  return null;
}

function assertValid(
  type: NormalizedContractSpecType,
  value: unknown,
  context: ArgumentSpecContext,
  path: string,
) {
  const issues = validateArgumentValue(type, value, context, path);
  if (issues.length) throw new ArgumentValueError(issues);
}

function largeInt(kind: "u64" | "i64" | "u128" | "i128" | "u256" | "i256", value: string) {
  return new XdrLargeInt(kind, value).toScVal();
}

function compareBytes(left: Uint8Array, right: Uint8Array) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function encodeCore(
  type: NormalizedContractSpecType,
  value: unknown,
  context: ArgumentSpecContext,
  path: string,
): xdr.ScVal {
  switch (type.kind) {
    case "bool":
      return xdr.ScVal.scvBool(value as boolean);
    case "void":
      return xdr.ScVal.scvVoid();
    case "u32":
      return xdr.ScVal.scvU32(Number(value));
    case "i32":
      return xdr.ScVal.scvI32(Number(value));
    case "u64":
    case "i64":
    case "u128":
    case "i128":
    case "u256":
    case "i256":
      return largeInt(type.kind, value as string);
    case "timepoint":
      return xdr.ScVal.scvTimepoint(xdr.Uint64.fromString(value as string));
    case "duration":
      return xdr.ScVal.scvDuration(xdr.Uint64.fromString(value as string));
    case "string":
      return xdr.ScVal.scvString(value as string);
    case "symbol":
      return xdr.ScVal.scvSymbol(value as string);
    case "bytes":
    case "bytesN":
      return xdr.ScVal.scvBytes(
        decodeBase64((value as TaggedBytesValue).value)! as unknown as Buffer,
      );
    case "address":
      return Address.fromString(value as string).toScVal();
    case "error": {
      const selected = value as { type: string; case: string };
      const code = context.errors
        .find((item) => item.name === selected.type)!
        .cases.find((item) => item.name === selected.case)!.value;
      return xdr.ScVal.scvError(xdr.ScError.sceContract(code));
    }
    case "option": {
      return value === null
        ? xdr.ScVal.scvVoid()
        : encodeCore(type.valueType, value, context, path);
    }
    case "result": {
      const result = value as { status: "ok" | "error"; value: unknown };
      return encodeCore(
        result.status === "ok" ? type.okType : type.errorType,
        result.value,
        context,
        fieldPath(path, "value"),
      );
    }
    case "vector":
      return xdr.ScVal.scvVec(
        (value as unknown[]).map((item, index) =>
          encodeCore(type.elementType, item, context, `${path}[${index}]`),
        ),
      );
    case "tuple":
      return xdr.ScVal.scvVec(
        type.elements.map((item, index) =>
          encodeCore(item, (value as unknown[])[index], context, `${path}[${index}]`),
        ),
      );
    case "map": {
      const seen = new Map<string, number>();
      const entries = (value as Array<{ key: unknown; value: unknown }>).map((item, index) => {
        const key = encodeCore(type.keyType, item.key, context, `${path}[${index}].key`);
        const identity = key.toXDR("base64");
        const duplicate = seen.get(identity);
        if (duplicate !== undefined) {
          throw new ArgumentValueError([
            issue(
              `${path}[${index}].key`,
              "duplicate_key",
              `Map key duplicates entry ${duplicate} after ScVal encoding.`,
            ),
          ]);
        }
        seen.set(identity, index);
        return new xdr.ScMapEntry({
          key,
          val: encodeCore(type.valueType, item.value, context, `${path}[${index}].value`),
        });
      });
      entries.sort((left, right) => compareBytes(left.key().toXDR(), right.key().toXDR()));
      return xdr.ScVal.scvMap(entries);
    }
    case "custom":
      return encodeCustom(type.name, value, context, path);
    case "value":
    case "muxedAddress":
      throw new ArgumentValueError([
        issue(path, "inspection_only", `${type.kind} cannot be encoded in Sprint 2.`),
      ]);
  }
}

function encodeCustom(name: string, value: unknown, context: ArgumentSpecContext, path: string) {
  const errorDefinition = namedError(context, name);
  if (errorDefinition) {
    const selected = value as { case: string };
    const code = errorDefinition.cases.find((item) => item.name === selected.case)!.value;
    return xdr.ScVal.scvError(xdr.ScError.sceContract(code));
  }
  const definition = customType(context, name)!;
  if (definition.kind === "enum") {
    const selected = definition.cases.find(
      (item) => item.name === (value as { case: string }).case,
    )!;
    return xdr.ScVal.scvU32(selected.value);
  }
  if (definition.kind === "union") {
    const union = value as { case: string; values: unknown[] };
    const selected = definition.cases.find((item) => item.name === union.case)!;
    return xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol(selected.name),
      ...selected.types.map((item, index) =>
        encodeCore(item, union.values[index], context, `${fieldPath(path, "values")}[${index}]`),
      ),
    ]);
  }
  const object = value as Record<string, unknown>;
  const numeric = definition.fields.every((field) => /^[0-9]+$/.test(field.name));
  if (numeric) {
    return xdr.ScVal.scvVec(
      definition.fields.map((field) =>
        encodeCore(field.type, object[field.name], context, fieldPath(path, field.name)),
      ),
    );
  }
  const entries = definition.fields.map(
    (field) =>
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol(field.name),
        val: encodeCore(field.type, object[field.name], context, fieldPath(path, field.name)),
      }),
  );
  entries.sort((left, right) => compareBytes(left.key().toXDR(), right.key().toXDR()));
  return xdr.ScVal.scvMap(entries);
}

export function encodeArgumentValue(
  type: NormalizedContractSpecType,
  value: unknown,
  context: ArgumentSpecContext,
  path = "$",
) {
  assertValid(type, value, context, path);
  return encodeCore(type, value, context, path);
}

function expectSwitch(value: xdr.ScVal, expected: string[], path: string) {
  if (!expected.includes(value.switch().name)) {
    throw new ArgumentValueError([
      issue(
        path,
        "scval_type",
        `Expected ${expected.join(" or ")}, received ${value.switch().name}.`,
      ),
    ]);
  }
}

function bytesFromScVal(value: xdr.ScVal): TaggedBytesValue {
  return { encoding: "base64", value: encodeBase64(Uint8Array.from(value.bytes())) };
}

function decodeError(value: xdr.ScVal, context: ArgumentSpecContext, path: string) {
  expectSwitch(value, ["scvError"], path);
  const error = value.error();
  if (error.switch().name !== "sceContract") {
    throw new ArgumentValueError([
      issue(path, "error_type", "Only contract error values are supported."),
    ]);
  }
  const code = error.contractCode();
  for (const errorEnum of context.errors) {
    const selected = errorEnum.cases.find((item) => item.value === code);
    if (selected) return { type: errorEnum.name, case: selected.name };
  }
  throw new ArgumentValueError([issue(path, "error_case", `Unknown contract error code ${code}.`)]);
}

function decodeCore(
  type: NormalizedContractSpecType,
  value: xdr.ScVal,
  context: ArgumentSpecContext,
  path: string,
): CanonicalArgumentValue {
  switch (type.kind) {
    case "bool":
      expectSwitch(value, ["scvBool"], path);
      return value.b();
    case "void":
      expectSwitch(value, ["scvVoid"], path);
      return null;
    case "u32":
      expectSwitch(value, ["scvU32"], path);
      return String(value.u32());
    case "i32":
      expectSwitch(value, ["scvI32"], path);
      return String(value.i32());
    case "u64":
    case "i64":
    case "u128":
    case "i128":
    case "u256":
    case "i256":
      expectSwitch(value, [`scv${type.kind[0]!.toUpperCase()}${type.kind.slice(1)}`], path);
      return scValToBigInt(value).toString();
    case "timepoint":
    case "duration":
      expectSwitch(value, [type.kind === "timepoint" ? "scvTimepoint" : "scvDuration"], path);
      return (type.kind === "timepoint" ? value.timepoint() : value.duration()).toString();
    case "string":
      expectSwitch(value, ["scvString"], path);
      return value.str().toString();
    case "symbol":
      expectSwitch(value, ["scvSymbol"], path);
      return value.sym().toString();
    case "bytes":
    case "bytesN":
      expectSwitch(value, ["scvBytes"], path);
      return bytesFromScVal(value);
    case "address":
      expectSwitch(value, ["scvAddress"], path);
      return Address.fromScVal(value).toString();
    case "error":
      return decodeError(value, context, path);
    case "option":
      return value.switch().name === "scvVoid"
        ? null
        : decodeCore(type.valueType, value, context, path);
    case "result":
      return value.switch().name === "scvError"
        ? {
            status: "error",
            value: decodeCore(type.errorType, value, context, fieldPath(path, "value")),
          }
        : {
            status: "ok",
            value: decodeCore(type.okType, value, context, fieldPath(path, "value")),
          };
    case "vector": {
      expectSwitch(value, ["scvVec"], path);
      return (value.vec() ?? []).map((item, index) =>
        decodeCore(type.elementType, item, context, `${path}[${index}]`),
      );
    }
    case "tuple": {
      expectSwitch(value, ["scvVec"], path);
      const values = value.vec() ?? [];
      if (values.length !== type.elements.length) {
        throw new ArgumentValueError([
          issue(path, "tuple_length", `Expected ${type.elements.length} tuple values.`),
        ]);
      }
      return type.elements.map((item, index) =>
        decodeCore(item, values[index]!, context, `${path}[${index}]`),
      );
    }
    case "map": {
      expectSwitch(value, ["scvMap"], path);
      return (value.map() ?? []).map((entry, index) => ({
        key: decodeCore(type.keyType, entry.key(), context, `${path}[${index}].key`),
        value: decodeCore(type.valueType, entry.val(), context, `${path}[${index}].value`),
      }));
    }
    case "custom":
      return decodeCustom(type.name, value, context, path);
    case "value":
    case "muxedAddress":
      throw new ArgumentValueError([
        issue(path, "inspection_only", `${type.kind} cannot be decoded in Sprint 2.`),
      ]);
  }
}

function decodeCustom(
  name: string,
  value: xdr.ScVal,
  context: ArgumentSpecContext,
  path: string,
): CanonicalArgumentValue {
  const errorDefinition = namedError(context, name);
  if (errorDefinition) return decodeError(value, context, path);
  const definition = customType(context, name);
  if (!definition) throw new ArgumentValueError([issue(path, "custom_type", `Unknown ${name}.`)]);
  if (definition.kind === "enum") {
    expectSwitch(value, ["scvU32"], path);
    const selected = definition.cases.find((item) => item.value === value.u32());
    if (!selected) throw new ArgumentValueError([issue(path, "variant", `Unknown ${name} value.`)]);
    return { case: selected.name };
  }
  if (definition.kind === "union") {
    expectSwitch(value, ["scvVec"], path);
    const values = value.vec() ?? [];
    if (!values[0]) {
      throw new ArgumentValueError([
        issue(fieldPath(path, "case"), "missing_variant", `Missing ${name} union variant.`),
      ]);
    }
    expectSwitch(values[0], ["scvSymbol"], fieldPath(path, "case"));
    const caseName = values[0].sym().toString();
    const selected = definition.cases.find((item) => item.name === caseName);
    if (!selected) {
      throw new ArgumentValueError([issue(fieldPath(path, "case"), "variant", `Unknown ${name}.`)]);
    }
    if (values.length - 1 !== selected.types.length) {
      throw new ArgumentValueError([
        issue(fieldPath(path, "values"), "tuple_length", "Union payload length does not match."),
      ]);
    }
    return {
      case: caseName,
      values: selected.types.map((item, index) =>
        decodeCore(item, values[index + 1]!, context, `${fieldPath(path, "values")}[${index}]`),
      ),
    };
  }
  const numeric = definition.fields.every((field) => /^[0-9]+$/.test(field.name));
  if (numeric) {
    expectSwitch(value, ["scvVec"], path);
    const values = value.vec() ?? [];
    if (values.length !== definition.fields.length) {
      throw new ArgumentValueError([
        issue(path, "tuple_length", `Struct ${name} expects ${definition.fields.length} fields.`),
      ]);
    }
    return Object.fromEntries(
      definition.fields.map((field, index) => [
        field.name,
        decodeCore(field.type, values[index]!, context, fieldPath(path, field.name)),
      ]),
    ) as CanonicalArgumentValue;
  }
  expectSwitch(value, ["scvMap"], path);
  const entries = new Map<string, xdr.ScVal>();
  for (const entry of value.map() ?? []) {
    expectSwitch(entry.key(), ["scvSymbol"], path);
    entries.set(entry.key().sym().toString(), entry.val());
  }
  return Object.fromEntries(
    definition.fields.map((field) => {
      const entry = entries.get(field.name);
      if (!entry) {
        throw new ArgumentValueError([
          issue(fieldPath(path, field.name), "missing_field", `Missing ${name}.${field.name}.`),
        ]);
      }
      return [field.name, decodeCore(field.type, entry, context, fieldPath(path, field.name))];
    }),
  ) as CanonicalArgumentValue;
}

export function decodeArgumentValue(
  type: NormalizedContractSpecType,
  value: xdr.ScVal,
  context: ArgumentSpecContext,
  path = "$",
) {
  const decoded = decodeCore(type, value, context, path);
  const issues = validateArgumentValue(type, decoded, context, path);
  if (issues.length) throw new ArgumentValueError(issues);
  return decoded;
}

export function scValPreview(
  type: NormalizedContractSpecType,
  value: unknown,
  context: ArgumentSpecContext,
) {
  return encodeArgumentValue(type, value, context).toXDR("base64");
}

export function createFunctionArgumentExamples(
  functionSpec: NormalizedContractFunction,
  context: ArgumentSpecContext,
) {
  return Object.fromEntries(
    functionSpec.parameters.map((parameter) => [
      parameter.name,
      createArgumentExample(parameter.type, context),
    ]),
  );
}

export function validateFunctionArguments(
  functionSpec: NormalizedContractFunction,
  values: unknown,
  context: ArgumentSpecContext,
) {
  if (!isRecord(values)) {
    return [issue("$", "type", "Function arguments must be an object keyed by parameter name.")];
  }
  const resolved = limits();
  if (utf8Size(values) > resolved.jsonBytes) {
    return [
      issue("$", "payload_limit", `Canonical JSON exceeds the ${resolved.jsonBytes}-byte limit.`),
    ];
  }
  const parameterNames = new Set(functionSpec.parameters.map((parameter) => parameter.name));
  const unknown = Object.keys(values).find((key) => !parameterNames.has(key));
  if (unknown) {
    return [issue(fieldPath("$", unknown), "unknown_key", `Unknown argument ${unknown}.`)];
  }
  return functionSpec.parameters.flatMap((parameter) =>
    validateArgumentValue(
      parameter.type,
      values[parameter.name],
      context,
      fieldPath("$", parameter.name),
    ),
  );
}

export function encodeFunctionArguments(
  functionSpec: NormalizedContractFunction,
  values: unknown,
  context: ArgumentSpecContext,
) {
  const issues = validateFunctionArguments(functionSpec, values, context);
  if (issues.length) throw new ArgumentValueError(issues);
  return functionSpec.parameters.map((parameter) =>
    encodeCore(
      parameter.type,
      (values as Record<string, unknown>)[parameter.name],
      context,
      fieldPath("$", parameter.name),
    ),
  );
}

export function decodeFunctionArguments(
  functionSpec: NormalizedContractFunction,
  values: xdr.ScVal[],
  context: ArgumentSpecContext,
) {
  if (values.length !== functionSpec.parameters.length) {
    throw new ArgumentValueError([
      issue(
        "$",
        "argument_count",
        `${functionSpec.name} expects ${functionSpec.parameters.length}.`,
      ),
    ]);
  }
  return Object.fromEntries(
    functionSpec.parameters.map((parameter, index) => [
      parameter.name,
      decodeArgumentValue(parameter.type, values[index]!, context, fieldPath("$", parameter.name)),
    ]),
  );
}

export function argumentCustomType(
  context: ArgumentSpecContext,
  name: string,
): NormalizedContractCustomType | undefined {
  return customType(context, name);
}

export function argumentErrorEnums(context: ArgumentSpecContext): NormalizedContractErrorEnum[] {
  return context.errors;
}
