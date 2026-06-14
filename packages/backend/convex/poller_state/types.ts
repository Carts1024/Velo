import type { Doc, Id } from "../_generated/dataModel";

export type PollerState = Doc<"pollerState">;
export type PollerStateId = Id<"pollerState">;
export type PollerStateStatus = PollerState["status"];
export type PublicPollStatus = "live" | "polling" | "stale" | "error" | "empty";
