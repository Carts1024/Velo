import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, StrKey, xdr } from "@stellar/stellar-sdk";

import {
  ContractSpecLoader,
  PLAYGROUND_SPEC_CACHE_MAX_ENTRIES,
  type PlaygroundContractSource,
  contractLoadErrorStatus,
  parsePlaygroundJson,
  playgroundErrorResponse,
  withRpcPolicy,
} from "./server/contract-loader.ts";

const contractId = StrKey.encodeContract(Keypair.random().rawPublicKey());
const wasmHash = "ab".repeat(32);
const entry = xdr.ScSpecEntry.scSpecEntryFunctionV0(
  new xdr.ScSpecFunctionV0({
    doc: "Hello",
    name: "hello",
    inputs: [],
    outputs: [xdr.ScSpecTypeDef.scSpecTypeSymbol()],
  }),
);

function source(overrides: Partial<PlaygroundContractSource> = {}): PlaygroundContractSource {
  return {
    resolveInstance: async () => ({ wasmHash, latestLedger: 10 }),
    fetchWasm: async () => Buffer.from("wasm"),
    parseSpec: async () => [entry],
    ...overrides,
  };
}

test("validates contract ID before performing RPC work", async () => {
  let called = false;
  const loader = new ContractSpecLoader(
    source({
      resolveInstance: async () => {
        called = true;
        return { wasmHash, latestLedger: 10 };
      },
    }),
  );

  await assert.rejects(loader.load({ network: "testnet", contractId: "invalid" }));
  assert.equal(called, false);
});

test("deduplicates concurrent loads and caches immutable specs by network and wasm hash", async () => {
  let fetches = 0;
  let parses = 0;
  const loader = new ContractSpecLoader(
    source({
      fetchWasm: async () => {
        fetches += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Buffer.from("wasm");
      },
      parseSpec: async () => {
        parses += 1;
        return [entry];
      },
    }),
  );

  const [first, second] = await Promise.all([
    loader.load({ network: "testnet", contractId }),
    loader.load({ network: "testnet", contractId }),
  ]);
  const third = await loader.load({ network: "testnet", contractId });

  assert.equal(fetches, 1);
  assert.equal(parses, 1);
  assert.equal(first.specHash, second.specHash);
  assert.equal(third.wasmHash, wasmHash);
  assert.notEqual(first.correlationId, second.correlationId);
});

test("resolving a new wasm hash invalidates the prior cache identity", async () => {
  let currentHash = wasmHash;
  let fetches = 0;
  const loader = new ContractSpecLoader(
    source({
      resolveInstance: async () => ({ wasmHash: currentHash, latestLedger: 10 }),
      fetchWasm: async () => {
        fetches += 1;
        return Buffer.from("wasm");
      },
    }),
  );

  await loader.load({ network: "mainnet", contractId });
  currentHash = "cd".repeat(32);
  await loader.load({ network: "mainnet", contractId });
  assert.equal(fetches, 2);
});

test("maps stable errors to public HTTP statuses", () => {
  assert.equal(contractLoadErrorStatus("INVALID_CONTRACT_ID"), 400);
  assert.equal(contractLoadErrorStatus("CONTRACT_NOT_FOUND"), 404);
  assert.equal(contractLoadErrorStatus("SOURCE_ACCOUNT_NOT_FOUND"), 404);
  assert.equal(contractLoadErrorStatus("CONTRACT_CHANGED"), 409);
  assert.equal(contractLoadErrorStatus("SIMULATION_FAILED"), 422);
  assert.equal(contractLoadErrorStatus("SPEC_TOO_LARGE"), 422);
  assert.equal(contractLoadErrorStatus("RPC_TIMEOUT"), 504);
  assert.equal(contractLoadErrorStatus("RPC_UPSTREAM"), 502);
});

test("simulation policy distinguishes a missing account from upstream failures", async () => {
  await assert.rejects(
    withRpcPolicy("simulate", async () => {
      throw new Error("Account not found: G...");
    }),
    (error) =>
      error instanceof Error && "code" in error && error.code === "SOURCE_ACCOUNT_NOT_FOUND",
  );
  await assert.rejects(
    withRpcPolicy("simulate", async () => {
      throw { code: 500 };
    }),
    (error) => error instanceof Error && "code" in error && error.code === "RPC_UPSTREAM",
  );
});

test("retries 429/5xx once and does not retry ordinary failures", async () => {
  let retryableAttempts = 0;
  const result = await withRpcPolicy("fetch-wasm", async () => {
    retryableAttempts += 1;
    if (retryableAttempts === 1) throw { code: 503 };
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(retryableAttempts, 2);

  let ordinaryAttempts = 0;
  await assert.rejects(
    withRpcPolicy("fetch-wasm", async () => {
      ordinaryAttempts += 1;
      throw { code: 400 };
    }),
  );
  assert.equal(ordinaryAttempts, 1);
});

test("maps timeout failures without exposing provider details", async () => {
  await assert.rejects(
    withRpcPolicy("resolve-instance", async () => {
      throw new Error("request timed out with secret=https://rpc.example/key");
    }),
    (error) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "RPC_TIMEOUT" &&
      !error.message.includes("rpc.example"),
  );
});

test("rejects oversized Wasm before parsing", async () => {
  let parsed = false;
  const loader = new ContractSpecLoader(
    source({
      fetchWasm: async () => Buffer.alloc(1_048_577),
      parseSpec: async () => {
        parsed = true;
        return [entry];
      },
    }),
  );
  await assert.rejects(loader.load({ network: "testnet", contractId }), /size limit/);
  assert.equal(parsed, false);
});

test("evicts the least-recently-used spec after 100 immutable entries", async () => {
  let fetches = 0;
  const ids = Array.from({ length: PLAYGROUND_SPEC_CACHE_MAX_ENTRIES + 1 }, () =>
    StrKey.encodeContract(Keypair.random().rawPublicKey()),
  );
  const loader = new ContractSpecLoader(
    source({
      resolveInstance: async (_network, id) => ({
        wasmHash: Buffer.from(id).toString("hex").slice(0, 64),
        latestLedger: 10,
      }),
      fetchWasm: async () => {
        fetches += 1;
        return Buffer.from("wasm");
      },
    }),
  );
  for (const id of ids) await loader.load({ network: "testnet", contractId: id });
  await loader.load({ network: "testnet", contractId: ids[0] });
  assert.equal(fetches, ids.length + 1);
});

test("public error envelope is stable and redacts causes", async () => {
  const response = playgroundErrorResponse(
    new Error("signedXdr=secret rpc=https://provider.invalid/key"),
    "corr-redacted",
  );
  const body = await response.text();
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("x-correlation-id"), "corr-redacted");
  assert.match(body, /RPC_UPSTREAM/);
  assert.doesNotMatch(body, /signedXdr|provider\.invalid|secret/);
});

test("invalid JSON is a validation error rather than an upstream failure", async () => {
  await assert.rejects(
    parsePlaygroundJson(
      new Request("http://localhost/api", {
        method: "POST",
        body: "{",
      }),
    ),
    (error) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_REQUEST" &&
      "stage" in error &&
      error.stage === "validate",
  );
});
