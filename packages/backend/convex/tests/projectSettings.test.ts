/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

function asWallet(t: ReturnType<typeof convexTest>, ownerAddress: string) {
  return t.withIdentity({
    subject: ownerAddress,
    issuer: "http://localhost:3000",
    tokenIdentifier: `http://localhost:3000|${ownerAddress}`,
  });
}

async function createProject(
  owner: ReturnType<typeof asWallet>,
  ownerAddress: string,
  slug: string,
) {
  return await owner.mutation(api.projects.mutation.createDraft, {
    name: "Original Project",
    slug,
    description: "Original description",
    metadataJson: JSON.stringify({ name: "Original Project", slug }),
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });
}

test("owner can update project settings without changing registry metadata", async () => {
  const t = convexTest(schema, modules);
  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const owner = asWallet(t, ownerAddress);
  const projectId = await createProject(owner, ownerAddress, "settings-project");

  await owner.mutation(api.projects.mutation.markRegistrationPending, {
    id: projectId,
    registrationTxHash: "a".repeat(64),
  });
  await owner.mutation(api.projects.mutation.markRegistrationSynced, {
    id: projectId,
    registryProjectId: 42,
    createdLedger: 123,
  });

  const before = await owner.query(api.projects.query.getById, { id: projectId });

  await owner.mutation(api.projects.mutation.updateSettings, {
    id: projectId,
    name: " Updated Project ",
    description: " Updated description ",
  });

  const after = await owner.query(api.projects.query.getById, { id: projectId });
  expect(after?.name).toBe("Updated Project");
  expect(after?.description).toBe("Updated description");
  expect(after?.metadataJson).toBe(before?.metadataJson);
  expect(after?.metadataHash).toBe(before?.metadataHash);
  expect(after?.status).toBe("registered");
});

test("another wallet cannot update settings or generate logo upload URL", async () => {
  const t = convexTest(schema, modules);
  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const attackerAddress = "GDFWQCS3C72IWT5QV6CJYCMCQZ4WQ2QELSE6ABWI5Q3XRZ6BPGRS6LZV";
  const owner = asWallet(t, ownerAddress);
  const attacker = asWallet(t, attackerAddress);
  const projectId = await createProject(owner, ownerAddress, "unauthorized-settings-project");

  await expect(
    attacker.mutation(api.projects.mutation.updateSettings, {
      id: projectId,
      name: "Spoofed",
      description: "Spoofed",
    }),
  ).rejects.toThrow("Unauthorized");

  await expect(
    attacker.mutation(api.projects.mutation.generateLogoUploadUrl, { id: projectId }),
  ).rejects.toThrow("Unauthorized");
});

test("owner can set, replace, and remove logo storage id", async () => {
  const t = convexTest(schema, modules);
  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const owner = asWallet(t, ownerAddress);
  const projectId = await createProject(owner, ownerAddress, "logo-settings-project");
  const firstLogoId = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["first"], { type: "image/png" }));
  });
  const secondLogoId = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["second"], { type: "image/png" }));
  });

  await owner.mutation(api.projects.mutation.setLogo, {
    id: projectId,
    logoStorageId: firstLogoId,
  });

  let project = await owner.query(api.projects.query.getById, { id: projectId });
  expect(project?.logoStorageId).toBe(firstLogoId);

  await owner.mutation(api.projects.mutation.setLogo, {
    id: projectId,
    logoStorageId: secondLogoId,
  });

  project = await owner.query(api.projects.query.getById, { id: projectId });
  expect(project?.logoStorageId).toBe(secondLogoId);

  await owner.mutation(api.projects.mutation.removeLogo, { id: projectId });

  project = await owner.query(api.projects.query.getById, { id: projectId });
  expect(project?.logoStorageId).toBeUndefined();
});
