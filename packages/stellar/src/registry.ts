import {
  Address,
  BASE_FEE,
  Contract,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import {
  assertValidContractId,
  assertValidMetadataHash,
  assertValidPublicKey,
  assertValidTransactionHash,
} from "./validation";

export type StellarTestnetConfig = {
  networkPassphrase: string;
  rpcUrl: string;
  registryContractId: string;
};

export type RegisterProjectTransactionInput = StellarTestnetConfig & {
  sourcePublicKey: string;
  ownerPublicKey: string;
  projectName: string;
  metadataHash: string;
};

export type SubmitSignedTransactionInput = {
  rpcUrl: string;
  networkPassphrase: string;
  signedXdr: string;
};

export type ConfirmRegistrationInput = StellarTestnetConfig & {
  transactionHash: string;
};

export type ContractLinkTransactionInput = StellarTestnetConfig & {
  sourcePublicKey: string;
  registryProjectId: number;
  officialContractId: string;
};

export type ConfirmContractTransactionInput = {
  rpcUrl: string;
  transactionHash: string;
};

export type RegistrationConfirmation =
  | {
      status: "pending";
      transactionHash: string;
    }
  | {
      status: "registered";
      transactionHash: string;
      registryProjectId: number | null;
      createdLedger: number | null;
    }
  | {
      status: "error";
      transactionHash: string;
      message: string;
    };

export type ContractTransactionConfirmation =
  | {
      status: "pending";
      transactionHash: string;
    }
  | {
      status: "confirmed";
      transactionHash: string;
      ledger: number | null;
    }
  | {
      status: "error";
      transactionHash: string;
      message: string;
    };

function metadataHashToBytes(metadataHash: string) {
  return xdr.ScVal.scvBytes(Buffer.from(assertValidMetadataHash(metadataHash), "hex"));
}

function registryClient(rpcUrl: string) {
  return new rpc.Server(rpcUrl);
}

function contractCallOperation(input: RegisterProjectTransactionInput) {
  const contract = new Contract(assertValidContractId(input.registryContractId));
  const owner = Address.fromString(assertValidPublicKey(input.ownerPublicKey));

  return contract.call(
    "register_project",
    owner.toScVal(),
    xdr.ScVal.scvString(input.projectName.trim()),
    metadataHashToBytes(input.metadataHash),
  );
}

function projectIdToScVal(projectId: number) {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    throw new Error("Registry project ID must be a positive integer");
  }

  return xdr.ScVal.scvU64(xdr.Uint64.fromString(projectId.toString()));
}

function officialContractAddressToScVal(contractId: string) {
  return Address.fromString(assertValidContractId(contractId)).toScVal();
}

function contractLinkOperation(input: ContractLinkTransactionInput, method: string) {
  const contract = new Contract(assertValidContractId(input.registryContractId));

  return contract.call(
    method,
    projectIdToScVal(input.registryProjectId),
    officialContractAddressToScVal(input.officialContractId),
  );
}

export async function buildRegisterProjectTransaction(input: RegisterProjectTransactionInput) {
  const sourcePublicKey = assertValidPublicKey(input.sourcePublicKey);
  assertValidContractId(input.registryContractId);
  assertValidPublicKey(input.ownerPublicKey);
  assertValidMetadataHash(input.metadataHash);

  if (!input.projectName.trim()) {
    throw new Error("Project name is required");
  }

  const server = registryClient(input.rpcUrl);
  const sourceAccount = await server.getAccount(sourcePublicKey);
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: input.networkPassphrase,
  })
    .addOperation(contractCallOperation(input))
    .setTimeout(300)
    .build();

  const prepared = await server.prepareTransaction(transaction);
  return prepared.toXDR();
}

async function buildContractLinkTransaction(input: ContractLinkTransactionInput, method: string) {
  const sourcePublicKey = assertValidPublicKey(input.sourcePublicKey);
  assertValidContractId(input.registryContractId);
  assertValidContractId(input.officialContractId);

  const server = registryClient(input.rpcUrl);
  const sourceAccount = await server.getAccount(sourcePublicKey);
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: input.networkPassphrase,
  })
    .addOperation(contractLinkOperation(input, method))
    .setTimeout(300)
    .build();

  const prepared = await server.prepareTransaction(transaction);
  return prepared.toXDR();
}

export function buildAddOfficialContractTransaction(input: ContractLinkTransactionInput) {
  return buildContractLinkTransaction(input, "add_contract");
}

export function buildRemoveOfficialContractTransaction(input: ContractLinkTransactionInput) {
  return buildContractLinkTransaction(input, "remove_contract");
}

export async function submitSignedTransaction(input: SubmitSignedTransactionInput) {
  const transaction = new Transaction(input.signedXdr, input.networkPassphrase);
  const response = await registryClient(input.rpcUrl).sendTransaction(transaction);

  if (response.status === "ERROR") {
    throw new Error(response.errorResult?.toXDR("base64") ?? "Transaction submission failed");
  }

  return assertValidTransactionHash(response.hash);
}

export async function confirmContractTransaction(
  input: ConfirmContractTransactionInput,
): Promise<ContractTransactionConfirmation> {
  const transactionHash = assertValidTransactionHash(input.transactionHash);
  const response = await registryClient(input.rpcUrl).getTransaction(transactionHash);

  if (response.status === "NOT_FOUND") {
    return { status: "pending", transactionHash };
  }

  if (response.status !== "SUCCESS") {
    return {
      status: "error",
      transactionHash,
      message: `Contract transaction ${response.status.toLowerCase()}`,
    };
  }

  return {
    status: "confirmed",
    transactionHash,
    ledger: response.ledger ?? null,
  };
}

function projectIdFromReturnValue(returnValue: xdr.ScVal | undefined | null) {
  if (!returnValue) {
    return null;
  }

  const nativeValue = scValToNative(returnValue) as unknown;
  if (typeof nativeValue === "number") {
    return nativeValue;
  }

  if (typeof nativeValue === "bigint") {
    return Number(nativeValue);
  }

  return null;
}

export async function confirmRegistration(
  input: ConfirmRegistrationInput,
): Promise<RegistrationConfirmation> {
  const transactionHash = assertValidTransactionHash(input.transactionHash);
  const response = await registryClient(input.rpcUrl).getTransaction(transactionHash);

  if (response.status === "NOT_FOUND") {
    return { status: "pending", transactionHash };
  }

  if (response.status !== "SUCCESS") {
    return {
      status: "error",
      transactionHash,
      message: `Registration transaction ${response.status.toLowerCase()}`,
    };
  }

  return {
    status: "registered",
    transactionHash,
    registryProjectId: projectIdFromReturnValue(response.returnValue),
    createdLedger: response.ledger ?? null,
  };
}
