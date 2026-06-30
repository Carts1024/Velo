/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("payment intent lifecycle", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";

  // Create a draft project
  const projectId = await t.mutation(api.projects.mutation.createDraft, {
    name: "Merchant Store",
    slug: "merchant-store",
    description: "Accepting USDC on Stellar",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  // Verify project defaults to paymentAccessActive undefined/null or false
  let project = await t.query(api.projects.query.getById, {
    id: projectId,
    ownerAddress,
  });
  expect(project?.paymentAccessActive).toBeFalsy();

  // Activate payment access using the proper mutation
  await t.mutation(api.projects.mutation.markPaymentAccessActive, {
    id: projectId,
    ownerAddress,
    checkoutCredits: 100,
  });

  // Generate API key
  const { rawKey } = await t.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
    ownerAddress,
    label: "Main API Key",
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Verify the key and fetch project data
  const verification = await t.query(api.projects.query.verifyApiKeyAndGetProject, {
    apiKeyHash,
  });
  expect(verification.authorized).toBe(true);
  expect(verification.project?.name).toBe("Merchant Store");
  expect(verification.project?.paymentAccessActive).toBe(true);

  // Create a payment intent using the public mutation
  const paymentIntentId = await t.mutation(api.payment_intents.mutations.createPaymentIntent, {
    apiKeyHash,
    amount: "150.50",
    asset: "native",
    description: "Order #44591",
    successUrl: "https://merchant.xyz/success",
    cancelUrl: "https://merchant.xyz/cancel",
  });

  // Retrieve the payment intent
  let intent = await t.query(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId,
  });
  expect(intent).toBeDefined();
  expect(intent?.status).toBe("created");
  expect(intent?.amount).toBe("150.50");
  expect(intent?.merchantName).toBe("Merchant Store");

  // Transition to pending state
  const payerAddress = "GDFX...PAYER";
  await t.mutation(api.payment_intents.mutations.updateStatus, {
    paymentIntentId,
    status: "pending",
    payerAddress,
  });

  intent = await t.query(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId,
  });
  expect(intent?.status).toBe("pending");
  expect(intent?.payerAddress).toBe(payerAddress);

  // Transition to paid state
  const txHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  await t.mutation(api.payment_intents.mutations.updateStatus, {
    paymentIntentId,
    status: "paid",
    txHash,
  });

  intent = await t.query(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId,
  });
  expect(intent?.status).toBe("paid");
  expect(intent?.txHash).toBe(txHash);

  // Listing by project
  const intentsList = await t.query(api.payment_intents.queries.listByProject, {
    projectId,
    ownerAddress,
    limit: 10,
  });
  expect(intentsList.length).toBe(1);
  expect(intentsList[0]._id).toBe(paymentIntentId);
});

test("payment intent creation allows omitted redirect urls", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const projectId = await t.mutation(api.projects.mutation.createDraft, {
    name: "Merchant Store",
    slug: "merchant-store-no-urls",
    description: "Accepting USDC on Stellar",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  await t.mutation(api.projects.mutation.markPaymentAccessActive, {
    id: projectId,
    ownerAddress,
    checkoutCredits: 100,
  });

  const { rawKey } = await t.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
    ownerAddress,
    label: "Main API Key",
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const paymentIntentId = await t.mutation(api.payment_intents.mutations.createPaymentIntent, {
    apiKeyHash,
    amount: "10.00",
    asset: "native",
    description: "Test payment",
  });

  const intent = await t.query(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId,
  });
  expect(intent?.amount).toBe("10.00");
  expect(intent?.description).toBe("Test payment");
  expect(intent?.successUrl).toBeUndefined();
  expect(intent?.cancelUrl).toBeUndefined();
});

test("payment intent stats aggregation and scanner execution", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const projectId = await t.mutation(api.projects.mutation.createDraft, {
    name: "Merchant Store Stats",
    slug: "merchant-store-stats",
    description: "Accepting USDC on Stellar",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  await t.mutation(api.projects.mutation.markPaymentAccessActive, {
    id: projectId,
    ownerAddress,
    checkoutCredits: 100,
  });

  const { rawKey } = await t.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
    ownerAddress,
    label: "Main API Key",
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Create two payment intents
  const pi1 = await t.mutation(api.payment_intents.mutations.createPaymentIntent, {
    apiKeyHash,
    amount: "50.00",
    asset: "native",
    description: "First stats payment",
  });

  const pi2 = await t.mutation(api.payment_intents.mutations.createPaymentIntent, {
    apiKeyHash,
    amount: "100.00",
    asset: "USDC:GBX",
    description: "Second stats payment",
  });

  // Verify status counts are initially showing created state
  let stats = await t.query(api.payment_intents.queries.getProjectStats, {
    projectId,
    ownerAddress,
  });
  expect(stats?.counts.total).toBe(2);
  expect(stats?.counts.created).toBe(2);
  expect(stats?.counts.paid).toBe(0);

  // Transition pi1 to pending
  await t.mutation(api.payment_intents.mutations.updateStatus, {
    paymentIntentId: pi1,
    status: "pending",
    payerAddress: "GDFX...PAYER",
    txHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  });

  // Transition pi2 to paid directly
  await t.mutation(api.payment_intents.mutations.updateStatus, {
    paymentIntentId: pi2,
    status: "pending",
    payerAddress: "GDFX...PAYER",
  });
  await t.mutation(api.payment_intents.mutations.updateStatus, {
    paymentIntentId: pi2,
    status: "paid",
    txHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  });

  // Verify updated status counts and volume
  stats = await t.query(api.payment_intents.queries.getProjectStats, {
    projectId,
    ownerAddress,
  });
  expect(stats?.counts.paid).toBe(1);
  expect(stats?.counts.pending).toBe(1);

  // Volume should reflect 100 USDC (since only USDC intent was paid)
  expect(stats?.volumes).toContainEqual({ asset: "USDC", volume: 100.0 });
  expect(stats?.recentPayments.length).toBe(2);
});
