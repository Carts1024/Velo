/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("project API key lifecycle", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";

  // Create a draft project
  const projectId = await t.mutation(api.projects.mutation.createDraft, {
    name: "Test Project",
    slug: "test-project",
    description: "A test project",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  // Project starts with no API key
  let project = await t.query(api.projects.query.getById, {
    id: projectId,
    ownerAddress,
  });
  expect(project).toBeDefined();
  expect(project?.apiKeyHash).toBeUndefined();
  expect(project?.apiKeyPrefix).toBeUndefined();

  // Generate API key
  const { rawKey } = await t.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
    ownerAddress,
  });

  expect(rawKey).toMatch(/^tk_live_[a-f0-9]{32}$/);

  // Compute the expected hash to verify query lookups
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Retrieve project and verify prefix and hash are set
  project = await t.query(api.projects.query.getById, {
    id: projectId,
    ownerAddress,
  });
  expect(project?.apiKeyHash).toBe(apiKeyHash);
  expect(project?.apiKeyPrefix).toBeDefined();
  expect(project?.apiKeyPrefix).toMatch(/^tk_live_[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/);
  expect(project?.apiKeyCreatedAt).toBeDefined();

  // Verify API Key querying with valid key
  const validQuery = await t.query(api.projects.query.verifyApiKeyAndGetEvents, {
    apiKeyHash,
    limit: 10,
  });
  expect(validQuery.authorized).toBe(true);
  expect(validQuery.project?.name).toBe("Test Project");
  expect(validQuery.events).toEqual([]);

  // Verify API Key querying with invalid key hash
  const invalidQuery = await t.query(api.projects.query.verifyApiKeyAndGetEvents, {
    apiKeyHash: "invalid_hash_value",
    limit: 10,
  });
  expect(invalidQuery.authorized).toBe(false);
  expect(invalidQuery.events).toBeUndefined();

  // Revoke API Key
  await t.mutation(api.projects.mutation.revokeApiKey, {
    id: projectId,
    ownerAddress,
  });

  // Verify key is revoked
  project = await t.query(api.projects.query.getById, {
    id: projectId,
    ownerAddress,
  });
  expect(project?.apiKeyHash).toBeUndefined();
  expect(project?.apiKeyPrefix).toBeUndefined();
  expect(project?.apiKeyCreatedAt).toBeUndefined();

  // Verify queries are now unauthorized
  const revokedQuery = await t.query(api.projects.query.verifyApiKeyAndGetEvents, {
    apiKeyHash,
    limit: 10,
  });
  expect(revokedQuery.authorized).toBe(false);
});
