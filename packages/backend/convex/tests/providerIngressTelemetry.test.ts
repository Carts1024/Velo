import { convexTest } from "convex-test";
/// <reference types="vite/client" />
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const ingest = makeFunctionReference<"mutation">("provider_events/mutation:ingestPdax");

test("new provider ingress stores only typed summary and safe trace context", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(ingest, {
    eventId: "provider-event-1",
    identifier: "provider-id-1",
    type: "WITHDRAWAL",
    payloadDigest: "a".repeat(64),
    status: "COMPLETED",
    requestCorrelationId: "request-00000001",
    traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  });
  const row = await t.run(
    async (ctx) =>
      await ctx.db
        .query("providerEvents")
        .withIndex("by_event_id", (q) => q.eq("eventId", "provider-event-1"))
        .unique(),
  );
  expect(row?.rawEvent).toBeUndefined();
  expect(row?.eventSummary).toMatchObject({ eventType: "WITHDRAWAL", status: "COMPLETED" });
  expect(row?.requestCorrelationId).toBe("request-00000001");
  expect(row?.traceparent).toMatch(/^00-/);
});

test("matched provider ingress keeps callback context but continues the original payment journey", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name: "provider",
      slug: "provider",
      description: "test",
      metadataJson: "{}",
      metadataHash: "0".repeat(64),
      ownerAddress: "GTEST",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    const paymentIntentId = await ctx.db.insert("paymentIntents", {
      projectId,
      amount: "1",
      asset: "native",
      merchantName: "provider",
      status: "created",
      correlationId: "journey-original-0001",
      traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
      expiresAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("providerOperations", {
      projectId,
      provider: "pdax",
      operation: "fiat_withdrawal",
      clientKey: "client-match",
      requestFingerprint: "fingerprint",
      requestJson: JSON.stringify({ paymentIntentId }),
      providerKey: "provider-match",
      state: "prepared",
      attemptCount: 0,
      reconciliationCount: 0,
      nextAttemptAt: now,
      leaseGeneration: 0,
      unresolvedExpiresAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    });
    return { projectId };
  });
  await t.mutation(ingest, {
    eventId: "matched-event",
    identifier: "provider-match",
    type: "WITHDRAWAL",
    payloadDigest: "b".repeat(64),
    requestCorrelationId: "callback-request-0001",
    traceparent: "00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01",
  });
  const state = await t.run(async (ctx) => ({
    event: await ctx.db
      .query("providerEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", "matched-event"))
      .unique(),
    stages: await ctx.db
      .query("journeyStages")
      .withIndex("by_journey_correlation_id_and_at", (q) =>
        q.eq("journeyCorrelationId", "journey-original-0001"),
      )
      .collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(state.event).toMatchObject({
    projectId: fixture.projectId,
    requestCorrelationId: "callback-request-0001",
    journeyCorrelationId: "journey-original-0001",
    requestTraceparent: "00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01",
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
  });
  expect(state.stages.map((stage) => stage.name)).toContain("provider.ingested");
  expect(
    state.scheduled.some((scheduled) =>
      scheduled.name.includes("provider_events/processing:processOne"),
    ),
  ).toBe(true);
});

test("matched project without an intent journey is still scheduled for processing", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name: "no-journey",
      slug: "no-journey",
      description: "test",
      metadataJson: "{}",
      metadataHash: "0".repeat(64),
      ownerAddress: "GTEST",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("providerOperations", {
      projectId,
      provider: "pdax",
      operation: "trade",
      clientKey: "client-no-journey",
      requestFingerprint: "fingerprint",
      providerKey: "provider-no-journey",
      state: "prepared",
      attemptCount: 0,
      reconciliationCount: 0,
      nextAttemptAt: now,
      leaseGeneration: 0,
      unresolvedExpiresAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    });
  });
  const result = await t.mutation(ingest, {
    eventId: "no-journey-event",
    identifier: "provider-no-journey",
    type: "TRADE",
    payloadDigest: "c".repeat(64),
    requestCorrelationId: "callback-request-0002",
    traceparent: "00-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-ffffffffffffffff-01",
  });
  expect(result.status).toBe("accepted");
  const scheduled = await t.run(
    async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled.some((row) => row.name.includes("provider_events/processing:processOne"))).toBe(
    true,
  );
});
