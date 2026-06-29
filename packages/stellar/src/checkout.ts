import { Horizon, Networks, Operation, TransactionBuilder, Asset } from "@stellar/stellar-sdk";

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

type HorizonErrorPayload = {
  title?: string;
  detail?: string;
  extras?: {
    result_codes?: {
      transaction?: string;
      operations?: string[];
    };
    result_xdr?: string;
  };
};

type AxiosLikeError = {
  response?: {
    status?: number;
    data?: HorizonErrorPayload;
  };
  message?: string;
};

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

function isCreditBalance(
  balance: Horizon.AccountResponse["balances"][number],
): balance is
  | Horizon.HorizonApi.BalanceLineAsset<"credit_alphanum4">
  | Horizon.HorizonApi.BalanceLineAsset<"credit_alphanum12"> {
  return balance.asset_type === "credit_alphanum4" || balance.asset_type === "credit_alphanum12";
}

function hasAssetTrustline(account: Horizon.AccountResponse, asset: Asset) {
  if (asset.isNative()) {
    return true;
  }

  return account.balances.some(
    (balance) =>
      isCreditBalance(balance) &&
      balance.asset_code === asset.getCode() &&
      balance.asset_issuer === asset.getIssuer(),
  );
}

function assetBalance(account: Horizon.AccountResponse, asset: Asset) {
  if (asset.isNative()) {
    const nativeBalance = account.balances.find((balance) => balance.asset_type === "native");
    return nativeBalance ? Number.parseFloat(nativeBalance.balance) : 0;
  }

  const balance = account.balances.find(
    (entry) =>
      isCreditBalance(entry) &&
      entry.asset_code === asset.getCode() &&
      entry.asset_issuer === asset.getIssuer(),
  );

  return balance ? Number.parseFloat(balance.balance) : 0;
}

function describeHorizonError(error: unknown): string {
  const axiosError = error as AxiosLikeError;
  const payload = axiosError.response?.data;
  const resultCodes = payload?.extras?.result_codes;
  const operationCodes = resultCodes?.operations?.filter(Boolean) ?? [];
  const codes = [resultCodes?.transaction, ...operationCodes].filter(Boolean).join(", ");

  if (codes) {
    return `${payload?.title ?? "Stellar transaction rejected"} (${codes})${
      payload?.detail ? `: ${payload.detail}` : ""
    }`;
  }

  return payload?.detail ?? payload?.title ?? axiosError.message ?? "Stellar transaction failed";
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
  const receiverAccount = await server.loadAccount(receiverAddress);
  const stellarAsset = parseAsset(assetStr);
  const paymentAmount = Number.parseFloat(amount);

  if (!hasAssetTrustline(receiverAccount, stellarAsset)) {
    throw new Error(
      `Receiver account does not have a trustline for ${stellarAsset.getCode()}. Use asset "native" for XLM payments or add the ${stellarAsset.getCode()} trustline to the receiver first.`,
    );
  }

  if (!hasAssetTrustline(account, stellarAsset)) {
    throw new Error(
      `Connected wallet does not have a trustline for ${stellarAsset.getCode()}. Use asset "native" for XLM payments or add the ${stellarAsset.getCode()} trustline to your wallet first.`,
    );
  }

  if (assetBalance(account, stellarAsset) < paymentAmount) {
    throw new Error(
      `Connected wallet does not have enough ${stellarAsset.getCode()} balance for this payment.`,
    );
  }

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
    const message = describeHorizonError(error);
    console.error("Stellar Horizon submission error:", message, error);
    throw new Error(message);
  }
}
