import type { Doc, Id } from "../_generated/dataModel";

export type ProjectContract = Doc<"projectContracts">;
export type ProjectContractId = Id<"projectContracts">;
export type ProjectContractStatus = ProjectContract["status"];
