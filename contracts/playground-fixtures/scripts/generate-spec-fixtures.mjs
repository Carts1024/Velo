import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import StellarSdk from "../../../packages/stellar/node_modules/@stellar/stellar-sdk/lib/index.js";
import { normalizeContractSpec } from "../../../packages/stellar/src/contract-spec.ts";

const { xdr } = StellarSdk;
const checkOnly = process.argv.includes("--check");
const unsupportedArguments = process.argv.slice(2).filter((value) => value !== "--check");
if (unsupportedArguments.length > 0) {
  throw new Error(`unsupported arguments: ${unsupportedArguments.join(", ")}`);
}
const workspace = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(workspace, "target", "wasm32v1-none", "release");
const stellarConfig = join(workspace, "target", "stellar-cli-config");
const rawDirectory = join(workspace, "spec-fixtures", "raw");
const expectedDirectory = join(workspace, "spec-fixtures", "expected");

const fixtures = [
  ["hello", "velo_playground_hello.wasm"],
  ["numeric", "velo_playground_numeric.wasm"],
  ["collections", "velo_playground_collections.wasm"],
  ["custom-types", "velo_playground_custom_types.wasm"],
  ["auth-events-errors", "velo_playground_auth_events_errors.wasm"],
];

mkdirSync(rawDirectory, { recursive: true });
mkdirSync(expectedDirectory, { recursive: true });

function persist(path, contents, name, stage) {
  if (!checkOnly) {
    writeFileSync(path, contents);
    return;
  }
  if (!existsSync(path) || readFileSync(path, "utf8") !== contents) {
    throw new Error(`fixture drift [${name}:${stage}]: run the generator and review the diff`);
  }
}

for (const [name, wasmFile] of fixtures) {
  const wasm = join(target, wasmFile);
  // `contract inspect` is retained here because its xdr-base64-array mode
  // preserves the boundary of each ordered ScSpecEntry. The replacement
  // `contract info interface` command emits one concatenated XDR stream.
  const encodedEntries = JSON.parse(
    execFileSync(
      "stellar",
      [
        "contract",
        "inspect",
        "--wasm",
        wasm,
        "--output",
        "xdr-base64-array",
        "--config-dir",
        stellarConfig,
        "--quiet",
      ],
      { encoding: "utf8" },
    ),
  );
  const entries = encodedEntries.map((encoded) => xdr.ScSpecEntry.fromXDR(encoded, "base64"));
  const normalized = normalizeContractSpec(entries, {
    network: "testnet",
    contractId: "UNDEPLOYED",
    wasmHash: "LOCAL_BUILD",
    latestLedger: 0,
    loadedAt: "1970-01-01T00:00:00.000Z",
    correlationId: "fixture-generation",
  });
  const expected = {
    schemaVersion: normalized.schemaVersion,
    specHash: normalized.specHash,
    rawEntries: normalized.rawEntries,
    functions: normalized.functions,
    customTypes: normalized.customTypes,
    errors: normalized.errors,
    events: normalized.events,
  };

  persist(
    join(rawDirectory, `${name}.xdr.json`),
    `${JSON.stringify(encodedEntries, null, 2)}\n`,
    name,
    "raw-xdr",
  );
  persist(
    join(expectedDirectory, `${name}.json`),
    `${JSON.stringify(expected, null, 2)}\n`,
    name,
    "normalized",
  );
  process.stdout.write(
    `${checkOnly ? "verified" : "generated"} ${name}: ${entries.length} spec entries\n`,
  );
}
