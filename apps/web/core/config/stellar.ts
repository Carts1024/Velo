import { env } from "./env.ts";

export const STELLAR_TESTNET_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const resolveCheckoutAsset = () => {
  const issuer = env.NEXT_PUBLIC_USDC_ISSUER;
  return issuer ? `USDC:${issuer}` : "native";
};

export const stellarConfig = {
  network: env.NEXT_PUBLIC_STELLAR_NETWORK,
  networkLabel: "Stellar Testnet",
  networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
  rpcUrl: env.NEXT_PUBLIC_STELLAR_RPC_URL,
  horizonUrl: "https://horizon-testnet.stellar.org",
  registryContractId: env.NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID,
  payAccessContractId: env.NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID,
  contractConfig: {
    registryConfigured: Boolean(env.NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID),
    payAccessConfigured: Boolean(env.NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID),
  },
  checkoutAsset: resolveCheckoutAsset(),
  firstWallet: "Freighter",
  publicVerifyRoutePrefix: "/verify",
  transactionDebuggerInput: "hash-required-xdr-deferred",
  webhookSigning: "deferred",
  webhookRetries: "deferred",
} as const;
