import { ContractSpecError } from "@repo/stellar";
import { StrKey } from "@stellar/stellar-sdk";

export type HelloFixtureCapability = {
  network: "testnet";
  contractId: string;
  wasmHash: string;
  functionName: "hello";
};

export function configuredHelloFixture(): HelloFixtureCapability {
  const contractId = process.env.PLAYGROUND_HELLO_CONTRACT_ID?.trim().toUpperCase() ?? "";
  const wasmHash = process.env.PLAYGROUND_HELLO_WASM_HASH?.trim().toLowerCase() ?? "";
  if (!StrKey.isValidContract(contractId) || !/^[a-f0-9]{64}$/.test(wasmHash)) {
    throw new ContractSpecError(
      "FIXTURE_NOT_CONFIGURED",
      "validate",
      "The Testnet hello fixture is not configured for live invocation.",
    );
  }
  return { network: "testnet", contractId, wasmHash, functionName: "hello" };
}

export function helloInvocationEligibility(network: string, contractId: string, wasmHash: string) {
  try {
    const fixture = configuredHelloFixture();
    return (
      network === fixture.network &&
      contractId === fixture.contractId &&
      wasmHash.toLowerCase() === fixture.wasmHash
    );
  } catch {
    return false;
  }
}
