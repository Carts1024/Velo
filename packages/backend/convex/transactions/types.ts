import type { Doc, Id } from "../_generated/dataModel";

export type Transaction = Doc<"transactions">;
export type TransactionId = Id<"transactions">;
export type TransactionStatus = Transaction["status"];
export type TransactionSource = "cache" | "rpc";

export type TransactionLookupResult = Omit<Transaction, "_id" | "_creationTime"> & {
  source: TransactionSource;
};
