import {
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
  Asset,
} from "@stellar/stellar-sdk";

export type CheckoutPaymentParams = {
  payerAddress: string;
  receiverAddress: string;
  amount: string;
  asset: string;
  networkPassphrase?: string;
  horizonUrl?: string;
};

export type CheckoutSubmitParams = {
  signedXdr: string;
  horizonUrl?: string;
};

const DEFAULT_TESTNET_HORIZON = "https://horizon-testnet.stellar.org";

/**
 * Parses an asset string into a Stellar Asset object.
 * Supports "native" or "CODE:ISSUER" format.
 */
function parseAsset(assetStr: string): Asset {
  if (assetStr === "native" || assetStr === "XLM") {
    return Asset.native();
  }

  const parts = assetStr.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid asset format: "${assetStr}". Use "native" or "CODE:ISSUER".`);
  }

  return new Asset(parts[0], parts[1]);
}

/**
 * Builds a Stellar payment transaction for checkout.
 * Returns the unsigned transaction XDR for wallet signing.
 */
export async function buildCheckoutPaymentTransaction(
  params: CheckoutPaymentParams,
): Promise<string> {
  const {
    payerAddress,
    receiverAddress,
    amount,
    asset: assetStr,
    networkPassphrase = Networks.TESTNET,
    horizonUrl = DEFAULT_TESTNET_HORIZON,
  } = params;

  if (payerAddress.trim().toUpperCase() === receiverAddress.trim().toUpperCase()) {
    throw new Error("Payer and receiver addresses must be different");
  }

  const numAmount = Number.parseFloat(amount);
  if (!amount || Number.isNaN(numAmount) || numAmount <= 0) {
    throw new Error("Amount must be positive");
  }

  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(payerAddress);
  const stellarAsset = parseAsset(assetStr);

  const transaction = new TransactionBuilder(account, {
    fee: "10000", // Standard maximum base fee (0.0001 XLM / operation limit)
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: receiverAddress,
        asset: stellarAsset,
        amount,
      }),
    )
    .setTimeout(300) // 5 minutes timeout
    .build();

  return transaction.toXDR();
}

/**
 * Submits a signed transaction XDR to the Stellar network via Horizon.
 * Returns the transaction hash and status.
 */
export async function submitCheckoutTransaction(
  params: CheckoutSubmitParams,
): Promise<{ hash: string; successful: boolean }> {
  const { signedXdr, horizonUrl = DEFAULT_TESTNET_HORIZON } = params;

  const server = new Horizon.Server(horizonUrl);
  const transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);

  try {
    const result = await server.submitTransaction(transaction);
    return {
      hash: result.hash,
      successful: result.successful,
    };
  } catch (error) {
    console.error("Stellar Horizon submission error:", error);
    throw error;
  }
}
