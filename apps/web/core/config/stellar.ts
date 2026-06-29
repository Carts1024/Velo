import { env } from "./env";

export const STELLAR_TESTNET_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

export const stellarConfig = {
  network: env.NEXT_PUBLIC_STELLAR_NETWORK,
  networkLabel: "Stellar Testnet",
  networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
  rpcUrl: env.NEXT_PUBLIC_STELLAR_RPC_URL,
  registryContractId: env.NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID || null,
  payAccessContractId: env.NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID || null,
  firstWallet: "Freighter",
  publicVerifyRoutePrefix: "/verify",
  transactionDebuggerInput: "hash-required-xdr-deferred",
  webhookSigning: "deferred",
  webhookRetries: "deferred",
} as const;
