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

  // Project starts with no API keys
  let keys = await t.query(api.projects.query.listApiKeys, {
    projectId,
    ownerAddress,
  });
  expect(keys).toEqual([]);

  // Generate API key 1
  const { rawKey: rawKey1 } = await t.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
    ownerAddress,
    label: "Dev Key",
  });

  expect(rawKey1).toMatch(/^tk_live_[a-f0-9]{32}$/);

  // Generate API key 2
  const { rawKey: rawKey2 } = await t.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
    ownerAddress,
    label: "Prod Key",
  });

  expect(rawKey2).toMatch(/^tk_live_[a-f0-9]{32}$/);

  // Compute the expected hashes to verify query lookups
  const computeHash = async (rawKey: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const apiKeyHash1 = await computeHash(rawKey1);
  const apiKeyHash2 = await computeHash(rawKey2);

  // Retrieve keys and verify prefixes, labels, and hashes are set correctly
  keys = await t.query(api.projects.query.listApiKeys, {
    projectId,
    ownerAddress,
  });
  expect(keys.length).toBe(2);

  const devKey = keys.find((k) => k.label === "Dev Key");
  const prodKey = keys.find((k) => k.label === "Prod Key");

  expect(devKey).toBeDefined();
  expect(devKey?.keyHash).toBe(apiKeyHash1);
  expect(devKey?.prefix).toMatch(/^tk_live_[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/);
  expect(devKey?.revoked).toBe(false);

  expect(prodKey).toBeDefined();
  expect(prodKey?.keyHash).toBe(apiKeyHash2);
  expect(prodKey?.prefix).toMatch(/^tk_live_[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/);
  expect(prodKey?.revoked).toBe(false);

  // Verify API Key 1 querying with valid key
  const validQuery1 = await t.query(api.projects.query.verifyApiKeyAndGetEvents, {
    apiKeyHash: apiKeyHash1,
    limit: 10,
  });
  expect(validQuery1.authorized).toBe(true);
  expect(validQuery1.project?.name).toBe("Test Project");
  expect(validQuery1.events).toEqual([]);

  // Verify API Key 2 querying with valid key
  const validQuery2 = await t.query(api.projects.query.verifyApiKeyAndGetEvents, {
    apiKeyHash: apiKeyHash2,
    limit: 10,
  });
  expect(validQuery2.authorized).toBe(true);

  // Verify API Key querying with invalid key hash
  const invalidQuery = await t.query(api.projects.query.verifyApiKeyAndGetEvents, {
    apiKeyHash: "invalid_hash_value",
    limit: 10,
  });
  expect(invalidQuery.authorized).toBe(false);
  expect(invalidQuery.events).toBeUndefined();

  // Revoke API Key 1
  await t.mutation(api.projects.mutation.revokeApiKey, {
    keyId: devKey!._id,
    projectId,
    ownerAddress,
  });

  // Verify key 1 is revoked and key 2 is still active
  keys = await t.query(api.projects.query.listApiKeys, {
    projectId,
    ownerAddress,
  });
  const revokedDevKey = keys.find((k) => k.label === "Dev Key");
  const activeProdKey = keys.find((k) => k.label === "Prod Key");

  expect(revokedDevKey?.revoked).toBe(true);
  expect(activeProdKey?.revoked).toBe(false);

  // Verify revoked key 1 is now unauthorized
  const revokedQuery = await t.query(api.projects.query.verifyApiKeyAndGetEvents, {
    apiKeyHash: apiKeyHash1,
    limit: 10,
  });
  expect(revokedQuery.authorized).toBe(false);

  // Verify active key 2 is still authorized
  const stillAuthorizedQuery = await t.query(api.projects.query.verifyApiKeyAndGetEvents, {
    apiKeyHash: apiKeyHash2,
    limit: 10,
  });
  expect(stillAuthorizedQuery.authorized).toBe(true);
});
