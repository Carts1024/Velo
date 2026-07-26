import { Networks, TransactionBuilder } from "@stellar/stellar-sdk";

export function transactionHashFromTestnetXdr(xdr: string) {
  return TransactionBuilder.fromXDR(xdr, Networks.TESTNET).hash().toString("hex");
}

export function assertWalletEnvelopeMatchesReview(
  unsignedXdr: string,
  signedXdr: string,
  reviewedTransactionHash: string,
) {
  const unsignedHash = transactionHashFromTestnetXdr(unsignedXdr);
  const signedHash = transactionHashFromTestnetXdr(signedXdr);
  if (unsignedHash !== reviewedTransactionHash || signedHash !== reviewedTransactionHash) {
    throw new Error("Wallet envelope mismatch: the signed transaction was not the reviewed XDR.");
  }
}
