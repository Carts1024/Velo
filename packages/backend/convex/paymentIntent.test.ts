/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function asWallet(t: ReturnType<typeof convexTest>, ownerAddress: string) {
  return t.withIdentity({
    subject: ownerAddress,
    issuer: "http://localhost:3000",
    tokenIdentifier: `http://localhost:3000|${ownerAddress}`,
  });
}

test("payment intent lifecycle", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const owner = asWallet(t, ownerAddress);

  // Create a draft project
  const projectId = await owner.mutation(api.projects.mutation.createDraft, {
    name: "Merchant Store",
    slug: "merchant-store",
    description: "Accepting USDC on Stellar",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  // Verify project defaults to paymentAccessActive undefined/null or false
  let project = await owner.query(api.projects.query.getById, {
    id: projectId,
  });
  expect(project?.paymentAccessActive).toBeFalsy();

  // Activate payment access using the proper mutation
  await owner.mutation(api.projects.mutation.markPaymentAccessActive, {
    id: projectId,
    checkoutCredits: 100,
  });

  // Generate API key
  const { rawKey } = await owner.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
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
  const { paymentIntentId } = await t.mutation(api.payment_intents.mutations.createPaymentIntent, {
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

  // Public checkout clients cannot transition directly to paid.
  const txHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  await expect(
    t.mutation(api.payment_intents.mutations.updateStatus, {
      paymentIntentId,
      status: "paid",
      txHash,
    }),
  ).rejects.toThrow("Public mutation cannot mark payment intent paid");

  intent = await t.query(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId,
  });
  expect(intent?.status).toBe("pending");

  // Verified backend confirmation is the only paid transition.
  await t.mutation(internal.payment_intents.mutations.markVerifiedPaid, {
    paymentIntentId,
    txHash,
  });

  intent = await t.query(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId,
  });
  expect(intent?.status).toBe("paid");
  expect(intent?.txHash).toBe(txHash);

  // Listing by project
  const intentsList = await owner.query(api.payment_intents.queries.listByProject, {
    projectId,
    limit: 10,
  });
  expect(intentsList.length).toBe(1);
  expect(intentsList[0]._id).toBe(paymentIntentId);
});

test("payment intent creation allows omitted redirect urls", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const owner = asWallet(t, ownerAddress);
  const projectId = await owner.mutation(api.projects.mutation.createDraft, {
    name: "Merchant Store",
    slug: "merchant-store-no-urls",
    description: "Accepting USDC on Stellar",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  await owner.mutation(api.projects.mutation.markPaymentAccessActive, {
    id: projectId,
    checkoutCredits: 100,
  });

  const { rawKey } = await owner.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
    label: "Main API Key",
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const { paymentIntentId } = await t.mutation(api.payment_intents.mutations.createPaymentIntent, {
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
  const owner = asWallet(t, ownerAddress);
  const projectId = await owner.mutation(api.projects.mutation.createDraft, {
    name: "Merchant Store Stats",
    slug: "merchant-store-stats",
    description: "Accepting USDC on Stellar",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  await owner.mutation(api.projects.mutation.markPaymentAccessActive, {
    id: projectId,
    checkoutCredits: 100,
  });

  const { rawKey } = await owner.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
    label: "Main API Key",
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Create two payment intents
  const { paymentIntentId: pi1 } = await t.mutation(
    api.payment_intents.mutations.createPaymentIntent,
    {
      apiKeyHash,
      amount: "50.00",
      asset: "native",
      description: "First stats payment",
    },
  );

  const { paymentIntentId: pi2 } = await t.mutation(
    api.payment_intents.mutations.createPaymentIntent,
    {
      apiKeyHash,
      amount: "100.00",
      asset: "USDC:GBX",
      description: "Second stats payment",
    },
  );

  // Verify status counts are initially showing created state
  let stats = await owner.query(api.payment_intents.queries.getProjectStats, {
    projectId,
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

  // Transition pi2 to paid through verified backend confirmation.
  await t.mutation(api.payment_intents.mutations.updateStatus, {
    paymentIntentId: pi2,
    status: "pending",
    payerAddress: "GDFX...PAYER",
  });
  await t.mutation(internal.payment_intents.mutations.markVerifiedPaid, {
    paymentIntentId: pi2,
    txHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  });

  // Verify updated status counts and volume
  stats = await owner.query(api.payment_intents.queries.getProjectStats, {
    projectId,
  });
  expect(stats?.counts.paid).toBe(1);
  expect(stats?.counts.pending).toBe(1);

  // Volume should reflect 100 USDC (since only USDC intent was paid)
  expect(stats?.volumes).toContainEqual({ asset: "USDC", volume: 100.0 });
  expect(stats?.recentPayments.length).toBe(2);
});

async function sha256Hex(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function createPaymentReadyProject(
  t: ReturnType<typeof convexTest>,
  args: { ownerAddress: string; name: string; slug: string },
) {
  const owner = asWallet(t, args.ownerAddress);
  const projectId = await owner.mutation(api.projects.mutation.createDraft, {
    name: args.name,
    slug: args.slug,
    description: "Accepting USDC on Stellar",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress: args.ownerAddress,
  });

  await owner.mutation(api.projects.mutation.markPaymentAccessActive, {
    id: projectId,
    checkoutCredits: 100,
  });

  const { rawKey } = await owner.mutation(api.projects.mutation.generateApiKey, {
    id: projectId,
    label: "Main API Key",
  });

  return { owner, projectId, apiKeyHash: await sha256Hex(rawKey) };
}

test("public payment intent create is idempotent per project and request", async () => {
  const t = convexTest(schema, modules);
  const { apiKeyHash } = await createPaymentReadyProject(t, {
    ownerAddress: "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP",
    name: "Idempotent Merchant",
    slug: "idempotent-merchant",
  });

  const first = await t.mutation(api.payment_intents.mutations.createPublicPaymentIntent, {
    apiKeyHash,
    amount: "25.00",
    asset: "native",
    description: "Order #1",
    idempotencyKey: "order-1",
  });
  expect(first.authorized).toBe(true);
  if (!first.authorized || "idempotencyConflict" in first) throw new Error("expected create");

  const replay = await t.mutation(api.payment_intents.mutations.createPublicPaymentIntent, {
    apiKeyHash,
    amount: "25.00",
    asset: "native",
    description: "Order #1",
    idempotencyKey: "order-1",
  });
  expect(replay.authorized).toBe(true);
  if (!replay.authorized || "idempotencyConflict" in replay) throw new Error("expected replay");
  expect(replay.idempotencyReplay).toBe(true);
  expect(replay.intent._id).toBe(first.intent._id);

  const conflict = await t.mutation(api.payment_intents.mutations.createPublicPaymentIntent, {
    apiKeyHash,
    amount: "30.00",
    asset: "native",
    description: "Order #1 changed",
    idempotencyKey: "order-1",
  });
  expect(conflict.authorized).toBe(true);
  expect("idempotencyConflict" in conflict && conflict.idempotencyConflict).toBe(true);
});

test("public retrieve and list are scoped to the API key project", async () => {
  const t = convexTest(schema, modules);
  const projectA = await createPaymentReadyProject(t, {
    ownerAddress: "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP",
    name: "Scoped Merchant A",
    slug: "scoped-merchant-a",
  });
  const projectB = await createPaymentReadyProject(t, {
    ownerAddress: "GBYV7ZZXECJON5RKIW3OUL5NIGKWE6B7VNOQVZ3ZQ7QIT6DXY7H3KGAB",
    name: "Scoped Merchant B",
    slug: "scoped-merchant-b",
  });

  const a1 = await t.mutation(api.payment_intents.mutations.createPublicPaymentIntent, {
    apiKeyHash: projectA.apiKeyHash,
    amount: "10.00",
    asset: "native",
    description: "A1",
  });
  const a2 = await t.mutation(api.payment_intents.mutations.createPublicPaymentIntent, {
    apiKeyHash: projectA.apiKeyHash,
    amount: "20.00",
    asset: "native",
    description: "A2",
  });
  const b1 = await t.mutation(api.payment_intents.mutations.createPublicPaymentIntent, {
    apiKeyHash: projectB.apiKeyHash,
    amount: "30.00",
    asset: "native",
    description: "B1",
  });

  if (!a1.authorized || "idempotencyConflict" in a1) throw new Error("expected a1");
  if (!a2.authorized || "idempotencyConflict" in a2) throw new Error("expected a2");
  if (!b1.authorized || "idempotencyConflict" in b1) throw new Error("expected b1");

  await t.mutation(api.payment_intents.mutations.updateStatus, {
    paymentIntentId: a2.intent._id,
    status: "pending",
    payerAddress: "GDFX...PAYER",
  });

  const ownRetrieve = await t.query(api.payment_intents.queries.getPublicPaymentIntent, {
    apiKeyHash: projectA.apiKeyHash,
    paymentIntentId: a1.intent._id,
  });
  expect(ownRetrieve.authorized).toBe(true);
  if (!ownRetrieve.authorized) throw new Error("expected auth");
  expect(ownRetrieve.intent?._id).toBe(a1.intent._id);

  const crossRetrieve = await t.query(api.payment_intents.queries.getPublicPaymentIntent, {
    apiKeyHash: projectA.apiKeyHash,
    paymentIntentId: b1.intent._id,
  });
  expect(crossRetrieve.authorized).toBe(true);
  if (!crossRetrieve.authorized) throw new Error("expected auth");
  expect(crossRetrieve.intent).toBeNull();

  const malformedRetrieve = await t.query(api.payment_intents.queries.getPublicPaymentIntent, {
    apiKeyHash: projectA.apiKeyHash,
    paymentIntentId: "not-a-valid-id",
  });
  expect(malformedRetrieve.authorized).toBe(true);
  if (!malformedRetrieve.authorized) throw new Error("expected auth");
  expect(malformedRetrieve.intent).toBeNull();

  const list = await t.query(api.payment_intents.queries.listPublicPaymentIntents, {
    apiKeyHash: projectA.apiKeyHash,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(list.authorized).toBe(true);
  if (!list.authorized) throw new Error("expected list");
  expect(list.page.page.map((intent) => intent._id).sort()).toEqual(
    [a1.intent._id, a2.intent._id].sort(),
  );

  const pendingList = await t.query(api.payment_intents.queries.listPublicPaymentIntents, {
    apiKeyHash: projectA.apiKeyHash,
    status: "pending",
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(pendingList.authorized).toBe(true);
  if (!pendingList.authorized) throw new Error("expected pending list");
  expect(pendingList.page.page).toHaveLength(1);
  expect(pendingList.page.page[0]._id).toBe(a2.intent._id);
});
