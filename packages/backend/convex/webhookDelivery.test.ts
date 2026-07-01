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

test("webhook endpoint secret rotation", async () => {
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

  // Save webhook settings (this creates the endpoint and generates a secret)
  await owner.mutation(api.webhook_endpoints.mutation.saveSettings, {
    projectId,
    url: "https://api.example.com/webhook",
    enabled: true,
    eventTypes: ["payment.succeeded"],
  });

  const settings = await owner.query(api.webhook_endpoints.query.getSettings, {
    projectId,
  });
  expect(settings).toBeDefined();
  expect(settings?.signingSecret).toBeDefined();
  const initialSecret = settings!.signingSecret;

  // Rotate secret
  await owner.mutation(api.webhook_endpoints.mutation.rotateSecret, {
    projectId,
  });

  const settingsRotated = await owner.query(api.webhook_endpoints.query.getSettings, {
    projectId,
  });
  expect(settingsRotated?.signingSecret).toBeDefined();
  expect(settingsRotated!.signingSecret).not.toBe(initialSecret);
});

test("webhook delivery retry and backoff lifecycle", async () => {
  const t = convexTest(schema, modules);

  const ownerAddress = "GD7O2C226SF2677PFFUVD6O2ICFOBNCWPI5Z46N43ZSFQGLM65U3I2SP";
  const owner = asWallet(t, ownerAddress);

  const projectId = await owner.mutation(api.projects.mutation.createDraft, {
    name: "Merchant Store Webhooks",
    slug: "merchant-store-webhooks",
    description: "Testing retries",
    metadataJson: "{}",
    metadataHash: "0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress,
  });

  await owner.mutation(api.webhook_endpoints.mutation.saveSettings, {
    projectId,
    url: "https://api.example.com/webhook",
    enabled: true,
    eventTypes: ["payment.succeeded"],
  });

  // Set up mock fetch that fails
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Connection failed");
  };

  try {
    // 1. Initial attempt fails
    await t.action(internal.webhookDelivery.trigger, {
      projectId,
      eventType: "payment.succeeded",
    });

    // Check delivery logs
    let deliveries = await owner.query(api.webhook_deliveries.query.listByProject, {
      projectId,
      limit: 10,
    });
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].status).toBe("pending");
    expect(deliveries[0].attemptCount).toBe(1);
    expect(deliveries[0].errorMessage).toBe("Connection failed");

    const deliveryId = deliveries[0]._id;

    // 2. Run a retry (e.g. attempt 2)
    await t.action(internal.webhookDelivery.trigger, {
      projectId,
      eventType: "payment.succeeded",
      deliveryId,
      attemptCount: 2,
    });

    deliveries = await owner.query(api.webhook_deliveries.query.listByProject, {
      projectId,
      limit: 10,
    });
    expect(deliveries[0].attemptCount).toBe(2);
    expect(deliveries[0].status).toBe("pending");

    // 3. Run final attempt 5 that fails, transitions to failed
    await t.action(internal.webhookDelivery.trigger, {
      projectId,
      eventType: "payment.succeeded",
      deliveryId,
      attemptCount: 5,
    });

    deliveries = await owner.query(api.webhook_deliveries.query.listByProject, {
      projectId,
      limit: 10,
    });
    expect(deliveries[0].attemptCount).toBe(5);
    expect(deliveries[0].status).toBe("failed");

    // 4. Test a successful delivery
    // Reset mock fetch to succeed
    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
      } as Response;
    };

    // Trigger new webhook delivery
    await t.action(internal.webhookDelivery.trigger, {
      projectId,
      eventType: "payment.succeeded",
    });

    deliveries = await owner.query(api.webhook_deliveries.query.listByProject, {
      projectId,
      limit: 10,
    });
    expect(deliveries[0].status).toBe("success");
    expect(deliveries[0].attemptCount).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
