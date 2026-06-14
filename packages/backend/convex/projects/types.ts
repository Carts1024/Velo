import type { Doc, Id } from "../_generated/dataModel";

export type Project = Doc<"projects">;
export type ProjectContract = Doc<"projectContracts">;
export type ProjectId = Id<"projects">;
export type ProjectContractId = Id<"projectContracts">;
export type ProjectStatus = Project["status"];

export type DraftProjectInput = Pick<
  Project,
  "name" | "slug" | "description" | "website" | "metadataJson" | "metadataHash" | "ownerAddress"
>;
