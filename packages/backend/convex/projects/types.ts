import type { Doc, Id } from "../_generated/dataModel";

export type Project = Doc<"projects">;
export type ProjectId = Id<"projects">;
export type ProjectStatus = Project["status"];

export type DraftProjectInput = Pick<
  Project,
  "name" | "slug" | "description" | "website" | "metadataJson" | "metadataHash" | "ownerAddress"
>;
