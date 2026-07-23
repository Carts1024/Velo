import { createHash } from "node:crypto";

import {
  ContractSpecError,
  decodeArgumentValue,
  encodeFunctionArguments,
  toJsonSafeContractValue,
} from "@repo/stellar";
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Keypair,
  Networks,
  rpc,
  scValToNative,
  StrKey,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import type { SimulationContext, SimulationSettings } from "../simulation-state.ts";
import type {
  ContractSpecDocumentV1,
  JsonSafeValue,
  NormalizedContractFunction,
} from "@repo/stellar";

import { createSimulationContextKey } from "../simulation-state.ts";
import { contractSpecLoader, getPlaygroundRpcServer, withRpcPolicy } from "./contract-loader.ts";
import { configuredHelloFixture, type HelloFixtureCapability } from "./fixture.ts";

export const PLAYGROUND_SIMULATION_TTL_SECONDS = 300;
export const PLAYGROUND_POLL_WINDOW_MS = 30_000;
export const PLAYGROUND_MAX_TOTAL_FEE_STROOPS = 10_000_000n;
export const PLAYGROUND_MAX_BASE_FEE_STROOPS = 10_000_000n;
export const PLAYGROUND_MAX_CPU_INSTRUCTIONS = 100_000_000;

export type NormalizedSimulationRequest = SimulationContext;
export type SimulationWarning = {
  code:
    | "ARCHIVED_STATE"
    | "AUTHORIZATION_REQUIRED"
    | "INSUFFICIENT_FEE_BALANCE"
    | "EXCESSIVE_FEE"
    | "NO_WRITES"
    | "DECODE_FALLBACK"
    | "EXECUTION_NOT_GUARANTEED";
  severity: "info" | "warning";
  source: "rpc" | "inference";
  message: string;
};
export type SimulationEvidence = {
  rpcRequestId: string;
  transactionDataXdr?: string;
  resultXdr?: string;
  authorizationEntries: Array<{ credentials: string; xdr: string }>;
  diagnosticEvents: Array<{ successfulCall: boolean; xdr: string }>;
  stateChanges: Array<{
    type: number;
    keyXdr: string;
    beforeXdr: string | null;
    afterXdr: string | null;
  }>;
  restorePreamble?: { minResourceFee: string; transactionDataXdr: string };
};
export type PlaygroundSimulationResult = {
  schemaVersion: 1;
  status: "success" | "restore_required";
  simulationId: string;
  correlationId: string;
  identity: string;
  contextKey: string;
  simulatedAt: string;
  expiresAt: string;
  latestLedger: number;
  request: Omit<NormalizedSimulationRequest, "arguments"> & {
    argumentNames: string[];
  };
  unsignedXdr: string;
  transactionHash: string;
  result: { decoded: JsonSafeValue | null; rawXdr: string | null };
  fee: {
    base: string;
    minimumResource: string;
    total: string;
    excessiveThreshold: string;
  };
  authorization: {
    required: boolean;
    entries: Array<{ credentials: string; xdr: string }>;
  };
  footprint: {
    readOnly: Array<{ type: string; xdr: string }>;
    readWrite: Array<{ type: string; xdr: string }>;
  };
  warnings: SimulationWarning[];
  evidence: SimulationEvidence;
  signingEligible: boolean;
};

export type HelloTransactionReview = {
  network: "testnet";
  sourceAccount: string;
  contractId: string;
  wasmHash: string;
  functionName: "hello";
  arguments: Array<{ name: "to"; type: "symbol"; value: string }>;
  sequence: string;
  timeBounds: { minTime: string; maxTime: string };
  baseFee: string;
  resourceFee: string;
  totalFee: string;
  transactionHash: string;
};

export type PlaygroundTransactionStatus =
  | { status: "pending"; transactionHash: string }
  | {
      status: "success";
      transactionHash: string;
      ledger: number;
      result: unknown;
      explorerUrl: string;
    }
  | {
      status: "failed";
      transactionHash: string;
      ledger: number;
      code: "CONTRACT_FAILED";
      message: string;
    };

export function assertHelloSymbol(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 32 ||
    !/^[A-Za-z0-9_]+$/.test(value)
  ) {
    throw new ContractSpecError(
      "INVALID_ARGUMENT",
      "validate",
      "The hello argument must be a 1–32 character Soroban Symbol.",
    );
  }
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedHash(value: unknown, label: string, optional = false) {
  const hash = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (optional && hash === "") return "";
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new ContractSpecError(
      "INVALID_REQUEST",
      "validate",
      `${label} must be 64 hexadecimal characters.`,
    );
  }
  return hash;
}

function normalizeSettings(value: unknown): SimulationSettings {
  const settings = record(value) ? value : {};
  const baseFee = settings.baseFee === undefined ? BASE_FEE : String(settings.baseFee).trim();
  let parsedBaseFee: bigint;
  try {
    parsedBaseFee = BigInt(baseFee);
  } catch {
    throw new ContractSpecError(
      "INVALID_SIMULATION_SETTINGS",
      "validate",
      "Base fee must be a whole-number stroop amount.",
    );
  }
  const cpuInstructions = settings.cpuInstructions ?? 0;
  if (
    parsedBaseFee < BigInt(BASE_FEE) ||
    parsedBaseFee > PLAYGROUND_MAX_BASE_FEE_STROOPS ||
    !Number.isSafeInteger(cpuInstructions) ||
    (cpuInstructions as number) < 0 ||
    (cpuInstructions as number) > PLAYGROUND_MAX_CPU_INSTRUCTIONS
  ) {
    throw new ContractSpecError(
      "INVALID_SIMULATION_SETTINGS",
      "validate",
      "Simulation fee or CPU leeway is outside the supported range.",
    );
  }
  return { baseFee: parsedBaseFee.toString(), cpuInstructions: cpuInstructions as number };
}

export function normalizeSimulationRequest(
  input: unknown,
  legacyFixture?: HelloFixtureCapability,
): NormalizedSimulationRequest {
  if (!record(input)) {
    throw new ContractSpecError("INVALID_REQUEST", "validate", "A JSON request body is required.");
  }
  assertTestnet(input.network);
  const contractId =
    typeof input.contractId === "string" ? input.contractId.trim().toUpperCase() : "";
  if (!StrKey.isValidContract(contractId)) {
    throw new ContractSpecError(
      "INVALID_CONTRACT_ID",
      "validate",
      "Contract ID must be a valid Stellar contract StrKey.",
    );
  }
  const sourceAccount =
    typeof input.sourceAccount === "string" ? input.sourceAccount.trim().toUpperCase() : "";
  if (!StrKey.isValidEd25519PublicKey(sourceAccount)) {
    throw new ContractSpecError(
      "INVALID_SOURCE_ACCOUNT",
      "validate",
      "Source account must be a valid Stellar account StrKey.",
    );
  }

  const legacy = Object.hasOwn(input, "argument");
  if (legacy) {
    const fixture = legacyFixture ?? configuredHelloFixture();
    if (contractId !== fixture.contractId) {
      throw new ContractSpecError(
        "CONTRACT_NOT_ALLOWLISTED",
        "validate",
        "The legacy simulation body is available only for the configured hello fixture.",
      );
    }
    return {
      network: "testnet",
      contractId,
      expectedWasmHash: fixture.wasmHash,
      expectedSpecHash: "",
      sourceAccount,
      functionName: fixture.functionName,
      arguments: { to: assertHelloSymbol(input.argument) },
      settings: normalizeSettings(input.settings),
    };
  }

  const functionName = typeof input.functionName === "string" ? input.functionName.trim() : "";
  if (!/^[A-Za-z0-9_]{1,64}$/.test(functionName)) {
    throw new ContractSpecError(
      "INVALID_FUNCTION",
      "validate",
      "Function name must be a valid Soroban identifier.",
    );
  }
  if (!record(input.arguments)) {
    throw new ContractSpecError(
      "INVALID_ARGUMENT",
      "validate",
      "Arguments must be an object keyed by parameter name.",
    );
  }
  return {
    network: "testnet",
    contractId,
    expectedWasmHash: normalizedHash(input.expectedWasmHash, "Expected Wasm hash"),
    expectedSpecHash: normalizedHash(input.expectedSpecHash, "Expected spec hash"),
    sourceAccount,
    functionName,
    arguments: input.arguments,
    settings: normalizeSettings(input.settings),
  };
}

const DEFAULT_REDACTED_KEYS = [
  "secret",
  "seed",
  "privatekey",
  "password",
  "token",
  "apikey",
  "authorizationheader",
];

export function redactSimulationEvidence(
  value: unknown,
  configuredKeys: string[] = [],
): JsonSafeValue {
  const redactedKeys = new Set(
    [...DEFAULT_REDACTED_KEYS, ...configuredKeys].map((key) =>
      key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase(),
    ),
  );
  const redact = (item: unknown, key = ""): JsonSafeValue => {
    const normalizedKey = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
    if (normalizedKey && redactedKeys.has(normalizedKey)) return "[REDACTED]";
    if (typeof item === "string" && /^S[A-Z2-7]{55}$/.test(item)) return "[REDACTED]";
    if (
      item === null ||
      typeof item === "boolean" ||
      typeof item === "string" ||
      (typeof item === "number" && Number.isFinite(item))
    ) {
      return item;
    }
    if (typeof item === "bigint") return item.toString();
    if (Array.isArray(item)) return item.map((entry) => redact(entry));
    if (record(item)) {
      return Object.fromEntries(
        Object.entries(item).map(([entryKey, entry]) => [entryKey, redact(entry, entryKey)]),
      );
    }
    return "[REDACTED]";
  };
  return redact(value);
}

function assertTestnet(value: unknown) {
  if (value !== "testnet") {
    throw new ContractSpecError(
      "MAINNET_INVOCATION_DISABLED",
      "validate",
      "Sprint 1 invocation is available on Testnet only.",
    );
  }
}

function transactionOperation(tx: Transaction) {
  if (tx.operations.length !== 1 || tx.operations[0]?.type !== "invokeHostFunction") {
    throw new ContractSpecError(
      "ENVELOPE_OPERATION_MISMATCH",
      "verify",
      "The transaction must contain exactly one contract invocation.",
    );
  }
  const operation = tx.operations[0];
  if (operation.func.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new ContractSpecError(
      "ENVELOPE_OPERATION_MISMATCH",
      "verify",
      "The transaction operation is not a contract call.",
    );
  }
  return operation.func.invokeContract();
}

export function parseHelloTransactionReview(
  tx: Transaction,
  fixture: HelloFixtureCapability,
): HelloTransactionReview {
  const invocation = transactionOperation(tx);
  const contractId = Address.fromScAddress(invocation.contractAddress()).toString();
  const functionName = invocation.functionName().toString();
  const args = invocation.args();
  const symbol =
    args.length === 1 && args[0]?.switch().name === "scvSymbol"
      ? args[0].sym().toString()
      : undefined;
  if (
    contractId !== fixture.contractId ||
    functionName !== fixture.functionName ||
    symbol === undefined
  ) {
    throw new ContractSpecError(
      "ENVELOPE_CALL_MISMATCH",
      "verify",
      "The transaction does not match the allowlisted hello call.",
    );
  }
  const value = assertHelloSymbol(symbol);
  if (!StrKey.isValidEd25519PublicKey(tx.source)) {
    throw new ContractSpecError(
      "INVALID_SOURCE_ACCOUNT",
      "verify",
      "The transaction source account is invalid.",
    );
  }
  const timeBounds = tx.timeBounds;
  if (!timeBounds || timeBounds.maxTime === "0") {
    throw new ContractSpecError(
      "UNBOUNDED_TRANSACTION",
      "verify",
      "The transaction must have a bounded expiry.",
    );
  }
  const totalFee = BigInt(tx.fee);
  const baseFee = BigInt(BASE_FEE);
  return {
    network: "testnet",
    sourceAccount: tx.source,
    contractId,
    wasmHash: fixture.wasmHash,
    functionName: "hello",
    arguments: [{ name: "to", type: "symbol", value }],
    sequence: tx.sequence,
    timeBounds,
    baseFee: BASE_FEE,
    resourceFee: (totalFee > baseFee ? totalFee - baseFee : 0n).toString(),
    totalFee: tx.fee,
    transactionHash: tx.hash().toString("hex"),
  };
}

function parseTransaction(xdr: string) {
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  } catch (error) {
    throw new ContractSpecError(
      "MALFORMED_ENVELOPE",
      "verify",
      "The transaction envelope is invalid.",
      false,
      { cause: error },
    );
  }
  if (parsed instanceof FeeBumpTransaction) {
    throw new ContractSpecError(
      "FEE_BUMP_NOT_ALLOWED",
      "verify",
      "Fee-bump transactions are not supported in Sprint 1.",
    );
  }
  return parsed;
}

export function verifySignedTransaction(
  signedXdr: string,
  reviewedTransactionHash: string,
  fixture: HelloFixtureCapability,
) {
  if (!/^[a-f0-9]{64}$/.test(reviewedTransactionHash)) {
    throw new ContractSpecError(
      "INVALID_TRANSACTION_HASH",
      "verify",
      "The reviewed transaction hash is invalid.",
    );
  }
  const tx = parseTransaction(signedXdr);
  if (tx.signatures.length < 1) {
    throw new ContractSpecError(
      "MISSING_SIGNATURE",
      "verify",
      "The wallet did not add a transaction signature.",
    );
  }
  const actualHash = tx.hash().toString("hex");
  if (actualHash !== reviewedTransactionHash) {
    throw new ContractSpecError(
      "ENVELOPE_HASH_MISMATCH",
      "verify",
      "The signed transaction differs from the reviewed transaction.",
    );
  }
  const sourceKeypair = Keypair.fromPublicKey(tx.source);
  const validSourceSignature = tx.signatures.some((signature) =>
    sourceKeypair.verify(tx.hash(), signature.signature()),
  );
  if (!validSourceSignature) {
    throw new ContractSpecError(
      "INVALID_SIGNATURE",
      "verify",
      "The signed envelope does not contain a valid source-account signature.",
    );
  }
  const review = parseHelloTransactionReview(tx, fixture);
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const maxTime = Number(review.timeBounds.maxTime);
  if (maxTime <= nowSeconds) {
    throw new ContractSpecError(
      "SIMULATION_EXPIRED",
      "verify",
      "The simulation has expired. Simulate again before signing.",
    );
  }
  if (maxTime > nowSeconds + PLAYGROUND_SIMULATION_TTL_SECONDS + 30) {
    throw new ContractSpecError(
      "UNBOUNDED_TRANSACTION",
      "verify",
      "The transaction expiry exceeds the Sprint 1 freshness window.",
    );
  }
  return { tx, review };
}

async function assertFixtureCurrent(fixture: HelloFixtureCapability, correlationId: string) {
  const document = await contractSpecLoader.load(
    { network: "testnet", contractId: fixture.contractId },
    correlationId,
  );
  if (document.wasmHash.toLowerCase() !== fixture.wasmHash) {
    throw new ContractSpecError(
      "FIXTURE_DRIFT",
      "resolve-instance",
      "The configured hello fixture Wasm hash no longer matches Testnet.",
    );
  }
}

export type SimulationServiceDependencies = {
  loadContract(input: unknown, correlationId: string): Promise<ContractSpecDocumentV1>;
  loadSourceAccount(sourceAccount: string): Promise<{ account: Account; balance: bigint | null }>;
  simulate(
    transaction: Transaction,
    cpuInstructions: number,
  ): Promise<rpc.Api.SimulateTransactionResponse>;
  assemble(
    transaction: Transaction,
    simulation: rpc.Api.SimulateTransactionSuccessResponse,
  ): Transaction;
  helloFixture(): HelloFixtureCapability | null;
  now(): number;
};

const defaultSimulationDependencies: SimulationServiceDependencies = {
  loadContract: (input, correlationId) => contractSpecLoader.load(input, correlationId),
  async loadSourceAccount(sourceAccount) {
    const server = getPlaygroundRpcServer("testnet");
    try {
      const entry = await withRpcPolicy("simulate", () => server.getAccountEntry(sourceAccount));
      return {
        account: new Account(sourceAccount, entry.seqNum().toString()),
        balance: BigInt(entry.balance().toString()),
      };
    } catch (error) {
      if (error instanceof ContractSpecError) throw error;
      throw new ContractSpecError(
        "SOURCE_ACCOUNT_NOT_FOUND",
        "simulate",
        "The Testnet source account could not be loaded.",
        false,
      );
    }
  },
  simulate: (transaction, cpuInstructions) =>
    withRpcPolicy("simulate", () =>
      getPlaygroundRpcServer("testnet").simulateTransaction(
        transaction,
        cpuInstructions > 0 ? { cpuInstructions } : undefined,
      ),
    ),
  assemble: (transaction, simulation) => rpc.assembleTransaction(transaction, simulation).build(),
  helloFixture() {
    try {
      return configuredHelloFixture();
    } catch {
      return null;
    }
  },
  now: Date.now,
};

function functionFromDocument(document: ContractSpecDocumentV1, name: string) {
  const functionSpec = document.functions.find((item) => item.name === name);
  if (!functionSpec) {
    throw new ContractSpecError(
      "INVALID_FUNCTION",
      "validate",
      `Function ${name} is not present in the loaded contract specification.`,
    );
  }
  return functionSpec;
}

function decodeSimulationResult(
  functionSpec: NormalizedContractFunction,
  result: xdr.ScVal | undefined,
  document: ContractSpecDocumentV1,
) {
  if (!result) return { decoded: null, rawXdr: null, fallback: false };
  const rawXdr = result.toXDR("base64");
  try {
    if (functionSpec.outputs.length === 0) {
      return { decoded: null, rawXdr, fallback: false };
    }
    const outputType =
      functionSpec.outputs.length === 1
        ? functionSpec.outputs[0]!.type
        : {
            kind: "tuple" as const,
            elements: functionSpec.outputs.map((output) => output.type),
          };
    return {
      decoded: decodeArgumentValue(outputType, result, document),
      rawXdr,
      fallback: false,
    };
  } catch {
    try {
      return {
        decoded: toJsonSafeContractValue(scValToNative(result)),
        rawXdr,
        fallback: true,
      };
    } catch {
      return { decoded: null, rawXdr, fallback: true };
    }
  }
}

function ledgerKeys(keys: xdr.LedgerKey[]) {
  return keys.map((key) => ({
    type: key.switch().name,
    xdr: key.toXDR("base64"),
  }));
}

function simulationEvidence(
  simulation: rpc.Api.SimulateTransactionSuccessResponse,
): SimulationEvidence {
  const auth = simulation.result?.auth ?? [];
  return {
    rpcRequestId: simulation.id,
    transactionDataXdr: simulation.transactionData.build().toXDR("base64"),
    resultXdr: simulation.result?.retval.toXDR("base64"),
    authorizationEntries: auth.map((entry) => ({
      credentials: entry.credentials().switch().name,
      xdr: entry.toXDR("base64"),
    })),
    diagnosticEvents: simulation.events.map((event) => ({
      successfulCall: event.inSuccessfulContractCall(),
      xdr: event.toXDR("base64"),
    })),
    stateChanges: (simulation.stateChanges ?? []).map((change) => ({
      type: change.type,
      keyXdr: change.key.toXDR("base64"),
      beforeXdr: change.before?.toXDR("base64") ?? null,
      afterXdr: change.after?.toXDR("base64") ?? null,
    })),
    ...(rpc.Api.isSimulationRestore(simulation)
      ? {
          restorePreamble: {
            minResourceFee: simulation.restorePreamble.minResourceFee,
            transactionDataXdr: simulation.restorePreamble.transactionData.build().toXDR("base64"),
          },
        }
      : {}),
  };
}

function errorEvidence(simulation: rpc.Api.SimulateTransactionErrorResponse) {
  return redactSimulationEvidence({
    rpcRequestId: simulation.id,
    latestLedger: simulation.latestLedger,
    diagnosticEvents: simulation.events.map((event) => ({
      successfulCall: event.inSuccessfulContractCall(),
      xdr: event.toXDR("base64"),
    })),
  });
}

export class PlaygroundSimulationService {
  private readonly dependencies: SimulationServiceDependencies;

  constructor(dependencies: SimulationServiceDependencies = defaultSimulationDependencies) {
    this.dependencies = dependencies;
  }

  async simulate(input: unknown, correlationId: string): Promise<PlaygroundSimulationResult> {
    let legacyFixture: HelloFixtureCapability | undefined;
    if (record(input) && Object.hasOwn(input, "argument") && input.network === "testnet") {
      legacyFixture = this.dependencies.helloFixture() ?? undefined;
    }
    let request = normalizeSimulationRequest(input, legacyFixture);
    const document = await this.dependencies.loadContract(
      { network: request.network, contractId: request.contractId },
      correlationId,
    );
    if (
      document.wasmHash.toLowerCase() !== request.expectedWasmHash ||
      (request.expectedSpecHash !== "" &&
        document.specHash.toLowerCase() !== request.expectedSpecHash)
    ) {
      throw new ContractSpecError(
        "CONTRACT_CHANGED",
        "resolve-instance",
        "The contract changed after it was loaded. Reload its specification before simulating.",
      );
    }
    request = {
      ...request,
      expectedWasmHash: document.wasmHash.toLowerCase(),
      expectedSpecHash: document.specHash.toLowerCase(),
    };
    const functionSpec = functionFromDocument(document, request.functionName);
    let encoded: xdr.ScVal[];
    try {
      encoded = encodeFunctionArguments(functionSpec, request.arguments, document);
    } catch (error) {
      if (error instanceof ContractSpecError) throw error;
      throw new ContractSpecError(
        "INVALID_ARGUMENT",
        "validate",
        "The function arguments do not match the contract specification.",
      );
    }
    const { account, balance } = await this.dependencies.loadSourceAccount(request.sourceAccount);
    const transaction = new TransactionBuilder(account, {
      fee: request.settings.baseFee,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(new Contract(request.contractId).call(request.functionName, ...encoded))
      .setTimeout(PLAYGROUND_SIMULATION_TTL_SECONDS)
      .build();
    const simulation = await this.dependencies.simulate(
      transaction,
      request.settings.cpuInstructions,
    );
    const simulationIdentity = {
      rpcRequestId: simulation.id,
      latestLedger: simulation.latestLedger,
    };
    if (rpc.Api.isSimulationError(simulation)) {
      throw new ContractSpecError(
        "SIMULATION_FAILED",
        "simulate",
        "The contract invocation failed during simulation.",
        false,
        { diagnostics: errorEvidence(simulation) },
      );
    }
    if (!rpc.Api.isSimulationSuccess(simulation)) {
      throw new ContractSpecError(
        "SIMULATION_FAILED",
        "simulate",
        "The RPC returned an unsupported simulation response.",
        false,
        {
          diagnostics: redactSimulationEvidence({
            ...simulationIdentity,
          }),
        },
      );
    }
    if (
      !simulation.transactionData ||
      typeof simulation.minResourceFee !== "string" ||
      !Number.isSafeInteger(simulation.latestLedger)
    ) {
      throw new ContractSpecError(
        "SIMULATION_FAILED",
        "simulate",
        "The RPC returned an incomplete simulation response.",
        false,
        {
          diagnostics: redactSimulationEvidence({
            ...simulationIdentity,
          }),
        },
      );
    }

    const assembled = this.dependencies.assemble(transaction, simulation);
    const now = this.dependencies.now();
    const expiresAt = new Date(now + PLAYGROUND_SIMULATION_TTL_SECONDS * 1_000).toISOString();
    const contextKey = createSimulationContextKey(request);
    const identity = createHash("sha256").update(contextKey).digest("hex");
    const decodedResult = decodeSimulationResult(functionSpec, simulation.result?.retval, document);
    const authorizationEntries = (simulation.result?.auth ?? []).map((entry) => ({
      credentials: entry.credentials().switch().name,
      xdr: entry.toXDR("base64"),
    }));
    const readOnly = ledgerKeys(simulation.transactionData.getReadOnly());
    const readWrite = ledgerKeys(simulation.transactionData.getReadWrite());
    const totalFee = BigInt(assembled.fee);
    const warnings: SimulationWarning[] = [];
    if (rpc.Api.isSimulationRestore(simulation)) {
      warnings.push({
        code: "ARCHIVED_STATE",
        severity: "warning",
        source: "rpc",
        message: "Archived ledger state must be restored before this invocation can be signed.",
      });
    }
    if (authorizationEntries.length > 0) {
      warnings.push({
        code: "AUTHORIZATION_REQUIRED",
        severity: "info",
        source: "rpc",
        message: "This invocation requires one or more Soroban authorization entries.",
      });
    }
    if (balance !== null && balance < totalFee) {
      warnings.push({
        code: "INSUFFICIENT_FEE_BALANCE",
        severity: "warning",
        source: "inference",
        message: "The source account balance is lower than the simulated total fee.",
      });
    }
    if (totalFee > PLAYGROUND_MAX_TOTAL_FEE_STROOPS) {
      warnings.push({
        code: "EXCESSIVE_FEE",
        severity: "warning",
        source: "inference",
        message: "The simulated total fee exceeds the Playground one-XLM warning threshold.",
      });
    }
    if (readWrite.length === 0) {
      warnings.push({
        code: "NO_WRITES",
        severity: "info",
        source: "rpc",
        message: "No writes detected in this simulation.",
      });
    }
    if (decodedResult.fallback) {
      warnings.push({
        code: "DECODE_FALLBACK",
        severity: "warning",
        source: "inference",
        message: "The return value could not be fully decoded from the normalized specification.",
      });
    }
    warnings.push({
      code: "EXECUTION_NOT_GUARANTEED",
      severity: "info",
      source: "inference",
      message: "A successful simulation does not guarantee final execution.",
    });
    const restoreRequired = rpc.Api.isSimulationRestore(simulation);
    const signingFixture = legacyFixture ?? this.dependencies.helloFixture();
    const signingEligible =
      !restoreRequired &&
      Boolean(
        signingFixture &&
        request.contractId === signingFixture.contractId &&
        request.expectedWasmHash === signingFixture.wasmHash &&
        request.functionName === signingFixture.functionName,
      );

    return {
      schemaVersion: 1,
      status: restoreRequired ? "restore_required" : "success",
      simulationId: crypto.randomUUID(),
      correlationId,
      identity,
      contextKey,
      simulatedAt: new Date(now).toISOString(),
      expiresAt,
      latestLedger: simulation.latestLedger,
      request: {
        network: request.network,
        contractId: request.contractId,
        expectedWasmHash: request.expectedWasmHash,
        expectedSpecHash: request.expectedSpecHash,
        sourceAccount: request.sourceAccount,
        functionName: request.functionName,
        settings: request.settings,
        argumentNames: functionSpec.parameters.map((parameter) => parameter.name),
      },
      unsignedXdr: assembled.toXDR(),
      transactionHash: assembled.hash().toString("hex"),
      result: { decoded: decodedResult.decoded, rawXdr: decodedResult.rawXdr },
      fee: {
        base: request.settings.baseFee,
        minimumResource: simulation.minResourceFee,
        total: assembled.fee,
        excessiveThreshold: PLAYGROUND_MAX_TOTAL_FEE_STROOPS.toString(),
      },
      authorization: {
        required: authorizationEntries.length > 0,
        entries: authorizationEntries,
      },
      footprint: { readOnly, readWrite },
      warnings,
      evidence: simulationEvidence(simulation),
      signingEligible,
    };
  }
}

export const playgroundSimulationService = new PlaygroundSimulationService();

export async function simulatePlayground(input: unknown, correlationId: string) {
  return playgroundSimulationService.simulate(input, correlationId);
}

/** @deprecated Use simulatePlayground. Retained for the Sprint 1 server contract. */
export const simulateHello = simulatePlayground;

export async function transactionStatus(
  transactionHash: string,
): Promise<PlaygroundTransactionStatus> {
  if (!/^[a-f0-9]{64}$/.test(transactionHash)) {
    throw new ContractSpecError(
      "INVALID_TRANSACTION_HASH",
      "poll",
      "Transaction hash must be 64 lowercase hexadecimal characters.",
    );
  }
  const response = await getPlaygroundRpcServer("testnet").getTransaction(transactionHash);
  if (response.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    return { status: "pending", transactionHash };
  }
  if (response.status === rpc.Api.GetTransactionStatus.FAILED) {
    return {
      status: "failed",
      transactionHash,
      ledger: response.ledger,
      code: "CONTRACT_FAILED",
      message: "The contract transaction failed.",
    };
  }
  if (!response.returnValue) {
    throw new ContractSpecError(
      "RESULT_DECODE_FAILED",
      "decode",
      "The successful transaction did not contain a return value.",
    );
  }
  return {
    status: "success",
    transactionHash,
    ledger: response.ledger,
    result: toJsonSafeContractValue(scValToNative(response.returnValue)),
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
  };
}

export async function submitHello(input: unknown, correlationId: string) {
  if (!input || typeof input !== "object") {
    throw new ContractSpecError("INVALID_REQUEST", "validate", "A JSON request body is required.");
  }
  const request = input as Record<string, unknown>;
  assertTestnet(request.network);
  if (typeof request.signedXdr !== "string" || request.signedXdr.length > 200_000) {
    throw new ContractSpecError(
      "MALFORMED_ENVELOPE",
      "validate",
      "A bounded signed transaction envelope is required.",
    );
  }
  const fixture = configuredHelloFixture();
  const reviewedHash =
    typeof request.reviewedTransactionHash === "string"
      ? request.reviewedTransactionHash.toLowerCase()
      : "";
  const { tx, review } = verifySignedTransaction(request.signedXdr, reviewedHash, fixture);
  await assertFixtureCurrent(fixture, correlationId);

  const server = getPlaygroundRpcServer("testnet");
  const submission = await server.sendTransaction(tx);
  if (submission.hash.toLowerCase() !== review.transactionHash) {
    throw new ContractSpecError(
      "SUBMISSION_HASH_MISMATCH",
      "submit",
      "Stellar RPC returned an unexpected transaction hash.",
    );
  }
  if (submission.status === "ERROR") {
    throw new ContractSpecError(
      "SUBMISSION_REJECTED",
      "submit",
      "Stellar RPC rejected the transaction.",
    );
  }
  if (submission.status === "TRY_AGAIN_LATER") {
    throw new ContractSpecError(
      "SUBMISSION_RETRYABLE",
      "submit",
      "Stellar RPC asked the client to retry submission.",
      true,
    );
  }

  const deadline = Date.now() + PLAYGROUND_POLL_WINDOW_MS;
  while (Date.now() < deadline) {
    const status = await transactionStatus(review.transactionHash);
    if (status.status !== "pending") return status;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return { status: "pending" as const, transactionHash: review.transactionHash };
}
