import { assertValidContractId } from "@repo/stellar";

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { ProjectId } from "../projects/types";
import type { ProjectContractId } from "./types";

import { normalizeAddress, requireOwnerProject } from "../projects/helpers";

export function normalizeContractId(contractId: string) {
  return assertValidContractId(contractId);
}

export async function requireRegisteredOwnerProject(
  ctx: MutationCtx,
  projectId: ProjectId,
  ownerAddress: string,
) {
  const project = await requireOwnerProject(ctx, projectId, ownerAddress);

  if (project.status !== "registered" || project.registryProjectId === undefined) {
    throw new Error("Only registered projects can manage official contracts");
  }

  return project;
}

export async function requireOwnerContract(
  ctx: MutationCtx,
  id: ProjectContractId,
  ownerAddress: string,
) {
  const contract = await ctx.db.get(id);

  if (!contract) {
    throw new Error("Contract link not found");
  }

  if (contract.ownerAddress !== normalizeAddress(ownerAddress)) {
    throw new Error("Connected wallet does not own this contract link");
  }

  return contract;
}

export async function activeContractsForProject(ctx: QueryCtx, projectId: ProjectId) {
  const contracts = await ctx.db
    .query("projectContracts")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(100);

  return contracts.filter(
    (contract) =>
      contract.status === "active" ||
      contract.status === "pending_remove" ||
      (contract.status === "contract_error" && contract.confirmedLedger !== undefined),
  );
}
