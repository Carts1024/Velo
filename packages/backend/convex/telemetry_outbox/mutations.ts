import {
  deterministicSample,
  ERROR_CODES,
  METRIC_NAMES,
  signUiTelemetryMarker,
  SPAN_NAMES,
  UI_TELEMETRY_MARKERS,
} from "@repo/observability";
import { v } from "convex/values";

import { env, internalMutation, mutation } from "../_generated/server";
import { isConvexTelemetryEnabled } from "./config";
import { telemetryStageValidator } from "./schema";

const outcome = v.union(
  v.literal("success"),
  v.literal("error"),
  v.literal("timeout"),
  v.literal("retry"),
  v.literal("rejected"),
);

const MAX_CLAIM_BATCH = 50;
const UI_MARKER_MAX_AGE_MS = 5 * 60_000;

function signaturesMatch(actual: string, expected: string) {
  if (!/^[0-9a-f]{64}$/.test(actual) || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export const recordUiMarker = mutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    marker: v.string(),
    durationMs: v.number(),
    signedAt: v.number(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedSecret = env.VELO_UI_TELEMETRY_INTAKE_SECRET;
    const now = Date.now();
    if (
      !expectedSecret ||
      !UI_TELEMETRY_MARKERS.includes(args.marker as (typeof UI_TELEMETRY_MARKERS)[number]) ||
      !Number.isFinite(args.durationMs) ||
      args.durationMs < 0 ||
      args.durationMs > 3_600_000 ||
      !Number.isSafeInteger(args.signedAt) ||
      Math.abs(now - args.signedAt) > UI_MARKER_MAX_AGE_MS
    ) {
      throw new Error("ui_telemetry_unauthorized");
    }
    const expectedSignature = await signUiTelemetryMarker(expectedSecret, {
      paymentIntentId: args.paymentIntentId,
      marker: args.marker,
      durationMs: args.durationMs,
      signedAt: args.signedAt,
    });
    if (!signaturesMatch(args.signature, expectedSignature)) {
      throw new Error("ui_telemetry_unauthorized");
    }
    const intent = await ctx.db.get(args.paymentIntentId);
    if (!intent) return false;
    const journeyCorrelationId = intent.correlationId ?? `payment-intent:${intent._id}`;
    if (isConvexTelemetryEnabled() && deterministicSample(journeyCorrelationId, 0.1)) {
      await ctx.db.insert("telemetryOutbox", {
        kind: "span",
        name: "velo.ui.render",
        operation: args.marker.slice(0, 96),
        stage: "ui_render",
        outcome: "success",
        journeyCorrelationId,
        traceparent: intent.traceparent,
        durationMs: Math.max(0, args.durationMs),
        state: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        leaseGeneration: 0,
        expiresAt: now + 14 * 24 * 60 * 60 * 1_000,
        createdAt: now,
      });
    }
    await ctx.db.insert("journeyStages", {
      journeyCorrelationId,
      name: "ui.rendered",
      source: "ui",
      outcome: "success",
      at: now,
      durationMs: Math.max(0, args.durationMs),
      expiresAt: now + 14 * 24 * 60 * 60 * 1_000,
    });
    return true;
  },
});

export const enqueue = internalMutation({
  args: {
    kind: v.union(v.literal("span"), v.literal("metric")),
    name: v.string(),
    operation: v.string(),
    stage: telemetryStageValidator,
    outcome,
    requestCorrelationId: v.optional(v.string()),
    journeyCorrelationId: v.optional(v.string()),
    traceparent: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    value: v.optional(v.number()),
    sampled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!isConvexTelemetryEnabled()) return null;
    const validName =
      args.kind === "span"
        ? SPAN_NAMES.includes(args.name as (typeof SPAN_NAMES)[number])
        : METRIC_NAMES.includes(args.name as (typeof METRIC_NAMES)[number]);
    if (
      !validName ||
      !/^[a-z0-9._:-]{1,96}$/.test(args.operation) ||
      (args.errorCode !== undefined &&
        !ERROR_CODES.includes(args.errorCode as (typeof ERROR_CODES)[number]))
    ) {
      throw new Error("invalid_telemetry_catalog");
    }
    if (
      args.kind === "span" &&
      args.outcome === "success" &&
      (args.sampled === false ||
        !deterministicSample(args.journeyCorrelationId ?? args.requestCorrelationId ?? "", 0.1))
    )
      return null;
    const now = Date.now();
    return await ctx.db.insert("telemetryOutbox", {
      kind: args.kind,
      name: args.name.slice(0, 96),
      operation: args.operation.slice(0, 96),
      stage: args.stage,
      outcome: args.outcome,
      ...(args.requestCorrelationId ? { requestCorrelationId: args.requestCorrelationId } : {}),
      ...(args.journeyCorrelationId ? { journeyCorrelationId: args.journeyCorrelationId } : {}),
      ...(args.traceparent ? { traceparent: args.traceparent } : {}),
      ...(args.durationMs !== undefined ? { durationMs: Math.max(0, args.durationMs) } : {}),
      ...(args.errorCode ? { errorCode: args.errorCode.slice(0, 64) } : {}),
      ...(args.value !== undefined ? { value: args.value } : {}),
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      leaseGeneration: 0,
      expiresAt: now + 14 * 24 * 60 * 60 * 1_000,
      createdAt: now,
    });
  },
});

export const claim = internalMutation({
  args: { leaseToken: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = Math.min(MAX_CLAIM_BATCH, Math.max(1, Math.floor(args.limit)));
    const expired = await ctx.db
      .query("telemetryOutbox")
      .withIndex("by_state_and_lease_expires_at", (q) =>
        q.eq("state", "leased").lt("leaseExpiresAt", now),
      )
      .take(limit);
    const claimed = [];
    for (const row of expired) {
      const leaseGeneration = row.leaseGeneration + 1;
      await ctx.db.patch(row._id, {
        state: "leased",
        leaseToken: args.leaseToken,
        leaseGeneration,
        leaseExpiresAt: now + 60_000,
      });
      claimed.push({ ...row, leaseToken: args.leaseToken, leaseGeneration });
    }
    const remaining = limit - claimed.length;
    if (remaining > 0) {
      const rows = await ctx.db
        .query("telemetryOutbox")
        .withIndex("by_state_and_next_attempt_at", (q) =>
          q.eq("state", "pending").lte("nextAttemptAt", now),
        )
        .take(remaining);
      for (const row of rows) {
        const leaseGeneration = row.leaseGeneration + 1;
        await ctx.db.patch(row._id, {
          state: "leased",
          leaseToken: args.leaseToken,
          leaseGeneration,
          leaseExpiresAt: now + 60_000,
        });
        claimed.push({ ...row, leaseToken: args.leaseToken, leaseGeneration });
      }
    }
    return claimed;
  },
});

export const complete = internalMutation({
  args: { ids: v.array(v.id("telemetryOutbox")), leaseToken: v.string() },
  handler: async (ctx, args) => {
    for (const id of args.ids.slice(0, 100)) {
      const row = await ctx.db.get(id);
      if (row?.state === "leased" && row.leaseToken === args.leaseToken) await ctx.db.delete(id);
    }
    return null;
  },
});

export const fail = internalMutation({
  args: { ids: v.array(v.id("telemetryOutbox")), leaseToken: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.ids.slice(0, 100)) {
      const row = await ctx.db.get(id);
      if (row?.state !== "leased" || row.leaseToken !== args.leaseToken) continue;
      const attemptCount = row.attemptCount + 1;
      await ctx.db.patch(id, {
        state: attemptCount >= 5 ? "dead_letter" : "pending",
        attemptCount,
        nextAttemptAt: now + Math.min(300_000, 1_000 * 2 ** attemptCount),
        leaseToken: undefined,
        leaseExpiresAt: undefined,
      });
    }
    return null;
  },
});

export const expire = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("telemetryOutbox")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(Math.min(args.limit ?? 100, 100));
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
