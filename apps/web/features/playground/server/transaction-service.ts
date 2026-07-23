import { ContractSpecError, toJsonSafeContractValue } from "@repo/stellar";
import {
  Address,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Keypair,
  Networks,
  nativeToScVal,
  rpc,
  scValToNative,
  StrKey,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { contractSpecLoader, getPlaygroundRpcServer } from "./contract-loader.ts";
import { configuredHelloFixture, type HelloFixtureCapability } from "./fixture.ts";

export const PLAYGROUND_SIMULATION_TTL_SECONDS = 300;
export const PLAYGROUND_POLL_WINDOW_MS = 30_000;

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

export async function simulateHello(input: unknown, correlationId: string) {
  if (!input || typeof input !== "object") {
    throw new ContractSpecError("INVALID_REQUEST", "validate", "A JSON request body is required.");
  }
  const request = input as Record<string, unknown>;
  assertTestnet(request.network);
  const fixture = configuredHelloFixture();
  const contractId =
    typeof request.contractId === "string" ? request.contractId.trim().toUpperCase() : "";
  if (contractId !== fixture.contractId) {
    throw new ContractSpecError(
      "CONTRACT_NOT_ALLOWLISTED",
      "validate",
      "Only the configured hello fixture can be invoked in Sprint 1.",
    );
  }
  const sourceAccount =
    typeof request.sourceAccount === "string" ? request.sourceAccount.trim().toUpperCase() : "";
  if (!StrKey.isValidEd25519PublicKey(sourceAccount)) {
    throw new ContractSpecError(
      "INVALID_SOURCE_ACCOUNT",
      "validate",
      "Source account must be a valid Stellar account StrKey.",
    );
  }
  const argument = assertHelloSymbol(request.argument);
  await assertFixtureCurrent(fixture, correlationId);

  const server = getPlaygroundRpcServer("testnet");
  let account;
  try {
    account = await server.getAccount(sourceAccount);
  } catch (error) {
    throw new ContractSpecError(
      "SOURCE_ACCOUNT_NOT_FOUND",
      "simulate",
      "The Testnet source account could not be loaded.",
      false,
      { cause: error },
    );
  }
  const raw = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(fixture.contractId).call(
        fixture.functionName,
        nativeToScVal(argument, { type: "symbol" }),
      ),
    )
    .setTimeout(PLAYGROUND_SIMULATION_TTL_SECONDS)
    .build();
  const simulation = await server.simulateTransaction(raw);
  if (!rpc.Api.isSimulationSuccess(simulation) || rpc.Api.isSimulationRestore(simulation)) {
    throw new ContractSpecError(
      "SIMULATION_FAILED",
      "simulate",
      "The hello invocation did not simulate successfully.",
      true,
    );
  }
  const assembled = rpc.assembleTransaction(raw, simulation).build();
  const review = parseHelloTransactionReview(assembled, fixture);
  return {
    unsignedXdr: assembled.toXDR(),
    transactionHash: review.transactionHash,
    expiresAt: new Date(Number(review.timeBounds.maxTime) * 1_000).toISOString(),
    fee: {
      base: review.baseFee,
      resource: review.resourceFee,
      total: review.totalFee,
    },
    review,
  };
}

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
