import {
  Address,
  humanizeEvents,
  rpc,
  scValToNative,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { assertValidTransactionHash } from "./validation.ts";

const TESTNET_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

export type DebugOperation = {
  index: number;
  type: string;
  source?: string;
};

export type DebugContractCall = {
  operationIndex: number;
  contractId?: string;
  functionName?: string;
  args: unknown[];
};

export type DebugEvent = {
  type: string;
  contractId?: string;
  topics: unknown[];
  data: unknown;
};

export type TransactionDebugResult = {
  hash: string;
  network: "testnet";
  status: "success" | "failed" | "not_found" | "unsupported";
  ledger?: number;
  createdAt?: number;
  feeCharged?: string;
  resultCode?: string;
  operations: DebugOperation[];
  contractCalls: DebugContractCall[];
  events: DebugEvent[];
  failureReason?: string;
  hint?: string;
  rawResponse: string;
};

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries(), ([key, entryValue]) => [String(key), jsonSafe(entryValue)]),
    );
  }

  if (Array.isArray(value)) {
    return value.map(jsonSafe);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, jsonSafe(entryValue)]),
    );
  }

  return value;
}

function rawTransactionResponse(response: rpc.Api.GetTransactionResponse) {
  const base = {
    status: response.status,
    transactionHash: response.txHash,
    latestLedger: response.latestLedger,
    oldestLedger: response.oldestLedger,
  };

  if (response.status === "NOT_FOUND") {
    return base;
  }

  return {
    ...base,
    ledger: response.ledger,
    createdAt: response.createdAt,
    feeBump: response.feeBump,
    envelopeXdr: response.envelopeXdr.toXDR("base64"),
    resultXdr: response.resultXdr.toXDR("base64"),
    resultMetaXdr: response.resultMetaXdr.toXDR("base64"),
    diagnosticEventsXdr: response.diagnosticEventsXdr?.map((event) => event.toXDR("base64")),
  };
}

function parseCreatedAt(value: unknown) {
  if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) {
    return undefined;
  }

  const createdAt = typeof value === "number" ? value : Number(value);
  return Number.isFinite(createdAt) ? createdAt : undefined;
}

function parseContractCalls(
  operations: ReturnType<typeof TransactionBuilder.fromXDR>["operations"],
) {
  return operations.flatMap<DebugContractCall>((operation, operationIndex) => {
    if (operation.type !== "invokeHostFunction") {
      return [];
    }

    try {
      if (operation.func.switch().name !== "hostFunctionTypeInvokeContract") {
        return [{ operationIndex, args: [] }];
      }

      const invocation = operation.func.invokeContract();
      return [
        {
          operationIndex,
          contractId: Address.fromScAddress(invocation.contractAddress()).toString(),
          functionName: invocation.functionName().toString(),
          args: invocation.args().map((argument) => jsonSafe(scValToNative(argument))),
        },
      ];
    } catch {
      return [{ operationIndex, args: [] }];
    }
  });
}

function failureHint(resultCode?: string) {
  if (!resultCode) {
    return "Inspect the raw response and diagnostic events for the failure source.";
  }

  if (/bad_auth|auth/i.test(resultCode)) {
    return "Check the signing wallet, network passphrase, and required contract authorization.";
  }

  if (/insufficient|underfunded|fee/i.test(resultCode)) {
    return "Fund the source account and confirm it can cover the transaction fee.";
  }

  if (/soroban|host|contract/i.test(resultCode)) {
    return "Inspect the contract call arguments and diagnostic events for the rejected invocation.";
  }

  return "Use the result code with the raw XDR to narrow down the failed operation.";
}

export function parseTransactionResponse(
  hash: string,
  response: rpc.Api.GetTransactionResponse,
): TransactionDebugResult {
  const normalizedHash = assertValidTransactionHash(hash);
  const rawResponse = JSON.stringify(rawTransactionResponse(response), null, 2);

  if (response.status === "NOT_FOUND") {
    return {
      hash: normalizedHash,
      network: "testnet",
      status: "not_found",
      operations: [],
      contractCalls: [],
      events: [],
      hint: "The hash may be pending, outside RPC retention, or not present on Testnet.",
      rawResponse,
    };
  }

  try {
    const transaction = TransactionBuilder.fromXDR(
      response.envelopeXdr,
      TESTNET_NETWORK_PASSPHRASE,
    );
    const operations = transaction.operations.map((operation, index) => ({
      index,
      type: operation.type,
      source: operation.source,
    }));
    const contractCalls = parseContractCalls(transaction.operations);
    const events = humanizeEvents(response.events.contractEventsXdr.flat()).map((event) => ({
      type: event.type,
      contractId: event.contractId,
      topics: jsonSafe(event.topics) as unknown[],
      data: jsonSafe(event.data),
    }));
    const resultCode = response.resultXdr.result().switch().name;

    return {
      hash: normalizedHash,
      network: "testnet",
      status: response.status === "SUCCESS" ? "success" : "failed",
      ledger: response.ledger,
      createdAt: parseCreatedAt(response.createdAt),
      feeCharged: response.resultXdr.feeCharged().toString(),
      resultCode,
      operations,
      contractCalls,
      events,
      failureReason: response.status === "FAILED" ? resultCode : undefined,
      hint: response.status === "FAILED" ? failureHint(resultCode) : undefined,
      rawResponse,
    };
  } catch (error) {
    return {
      hash: normalizedHash,
      network: "testnet",
      status: "unsupported",
      ledger: response.ledger,
      createdAt: parseCreatedAt(response.createdAt),
      operations: [],
      contractCalls: [],
      events: [],
      failureReason: error instanceof Error ? error.message : "Transaction decode failed",
      hint: "The RPC response was found, but this envelope or result could not be decoded.",
      rawResponse,
    };
  }
}

export async function lookupTestnetTransaction(rpcUrl: string, hash: string) {
  const normalizedHash = assertValidTransactionHash(hash);
  const response = await new rpc.Server(rpcUrl).getTransaction(normalizedHash);
  return parseTransactionResponse(normalizedHash, response);
}
