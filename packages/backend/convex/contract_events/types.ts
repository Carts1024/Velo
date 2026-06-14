import type { Doc, Id } from "../_generated/dataModel";

export type ContractEvent = Doc<"contractEvents">;
export type ContractEventId = Id<"contractEvents">;

export type PollTarget = {
  projectId: Id<"projects">;
  contractIds: string[];
  lastLedger?: number;
};
