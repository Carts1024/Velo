import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  coldResetPayload,
  runnerClockEvent,
  runnerClockProvenance,
  validateClockProvenance,
  validateLifecycleSample,
} from "./lifecycle.mjs";

export function createScenarioAdapter(scenario, options = {}) {
  if (scenario.adapter === "http") return createHttpAdapter(scenario, options);
  if (scenario.adapter === "control") return createControlAdapter(scenario, options);
  throw new Error(`${scenario.id} uses non-executable adapter ${scenario.adapter}`);
}

export function parseServerTimingHeader(header) {
  if (typeof header !== "string" || !header.trim()) return [];

  const timings = [];
  for (const entry of splitQuotedHeaderValue(header, ",")) {
    const [rawName, ...parameters] = splitQuotedHeaderValue(entry, ";");
    const name = rawName.trim();
    if (!isHttpToken(name)) continue;

    const durationParameter = parameters.find((parameter) => {
      const separator = parameter.indexOf("=");
      return separator >= 0 && parameter.slice(0, separator).trim().toLowerCase() === "dur";
    });
    if (!durationParameter) continue;

    const separator = durationParameter.indexOf("=");
    const rawDuration = durationParameter.slice(separator + 1).trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawDuration)) continue;
    const durationMs = Number(rawDuration);
    if (!Number.isFinite(durationMs)) continue;

    timings.push({ name, durationMs: round(durationMs), controlledBy: "Velo" });
  }
  return timings;
}

function splitQuotedHeaderValue(value, delimiter) {
  const parts = [];
  let current = "";
  let escaped = false;
  let quoted = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      current += character;
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === delimiter) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

function isHttpToken(value) {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
}

function createHttpAdapter(
  scenario,
  { env = process.env, fetchImpl = globalThis.fetch, fixtureController } = {},
) {
  fixtureController ??= createRemoteHttpFixtureController(scenario, env, fetchImpl);
  const setup = async (context) => {
    requireEnvironment(scenario.requiredEnv, env, scenario.id);
    assertAuthorizedUrl(env.VELO_BENCHMARK_BASE_URL, env);
    if (!fixtureController?.setup || !fixtureController?.cleanup) {
      throw new Error(
        `${scenario.id} qualification requires an authorized cohort fixture controller with scoped cleanup`,
      );
    }
    if (context.temperature === "cold" && !fixtureController?.resetBeforeSample) {
      throw new Error(
        `${scenario.id} HTTP cold qualification requires controller reset evidence per sample`,
      );
    }
    const controlled = await fixtureController.setup(context, scenario);
    if (
      controlled?.authorized !== true ||
      controlled?.authorizationId !== env.VELO_BENCHMARK_AUTHORIZATION_ID ||
      controlled?.evidenceMode !== "real" ||
      controlled?.cohortId !== context.cohortId ||
      controlled?.temperatureApplied !== context.temperature ||
      controlled?.profileApplied !== context.profile ||
      !controlled?.fixtureId ||
      !controlled?.cleanupToken ||
      !controlled?.setupReceiptId
    ) {
      throw new Error(`${scenario.id} fixture controller did not authorize the capture cohort`);
    }
    return {
      fixtureId: controlled.fixtureId,
      cleanupToken: controlled.cleanupToken,
      evidenceMode: "real",
      clockProvenance: [runnerClockProvenance()],
      temperatureApplied: controlled.temperatureApplied,
      profileApplied: controlled.profileApplied,
      fixtureControl: {
        authorized: true,
        cohortId: context.cohortId,
        setupReceiptId: controlled.setupReceiptId,
      },
    };
  };
  const execute = async (fixture, context) => {
    let coldResetEvidence;
    try {
      coldResetEvidence =
        context.temperature === "cold"
          ? verifyColdResetEvidence(
              await fixtureController.resetBeforeSample(fixture, context, scenario),
              context,
              env.VELO_BENCHMARK_CONTROL_SECRET,
              env.VELO_BENCHMARK_AUTHORIZATION_ID,
            )
          : undefined;
    } catch (error) {
      return {
        sample: context.sample,
        status: "error",
        evidenceMode: "real",
        httpStatus: 0,
        timeout: false,
        lifecycle: [],
        metrics: [],
        errorDetail: {
          class: "authorization",
          code: "invalid_cold_reset_evidence",
          errors: [error instanceof Error ? error.message : "cold reset verification failed"],
        },
      };
    }
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);
    try {
      const response = await fetchImpl(
        `${stripTrailingSlash(env.VELO_BENCHMARK_BASE_URL)}${scenario.path}`,
        {
          method: scenario.method,
          headers: {
            authorization: `Bearer ${env.VELO_BENCHMARK_API_KEY}`,
            "x-correlation-id": `bench-${context.runId}-${context.sample}`,
            "x-velo-benchmark-temperature": context.temperature,
            "x-velo-benchmark-cohort-id": context.cohortId,
            "x-velo-benchmark-fixture-id": fixture.fixtureId,
            ...(context.temperature === "warm" ? { connection: "keep-alive" } : {}),
            ...replaceVariables(scenario.headers ?? {}, {
              RUN_ID: context.runId,
              SAMPLE: String(context.sample),
            }),
          },
          ...(scenario.body ? { body: JSON.stringify(scenario.body) } : {}),
          signal: controller.signal,
        },
      );
      const httpSuccess = response.status >= 200 && response.status < 400;
      const outcome = httpSuccess ? await readHttpOutcome(response, scenario) : { errors: [] };
      const endedAt = performance.now();
      const success = httpSuccess && outcome.errors.length === 0;
      return {
        sample: context.sample,
        status: success ? "success" : "error",
        evidenceMode: "real",
        httpStatus: response.status,
        correlationId: response.headers.get("x-correlation-id"),
        ...(outcome.value === undefined ? {} : { outcome: outcome.value }),
        ...(coldResetEvidence ? { coldResetEvidence } : {}),
        timeout: false,
        lifecycle: [
          runnerClockEvent("http.request_start", startedAt),
          runnerClockEvent("http.response_end", endedAt),
        ],
        metrics: [
          {
            name: "http_request_ms",
            unit: "ms",
            startEvent: "http.request_start",
            endEvent: "http.response_end",
            durationMs: round(endedAt - startedAt),
          },
        ],
        dependencyTimings: parseServerTimingHeader(response.headers.get("server-timing")),
        queueDepth: 0,
        eventLagMs: 0,
        ...(success
          ? {}
          : outcome.errors.length
            ? {
                errorDetail: {
                  class: "outcome",
                  code: "invalid_http_outcome",
                  errors: outcome.errors,
                },
              }
            : { error: classifyHttpError(response.status, response.headers) }),
      };
    } catch (error) {
      return {
        sample: context.sample,
        status: "error",
        evidenceMode: "real",
        httpStatus: 0,
        timeout: controller.signal.aborted,
        lifecycle: [],
        metrics: [],
        errorDetail: {
          class: controller.signal.aborted ? "timeout" : "network",
          code: error instanceof Error ? error.name : "request_failed",
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    id: scenario.id,
    setup,
    prime: async (fixture, context) => {
      if (context.temperature !== "warm") return;
      const sample = await execute(fixture, { ...context, sample: "prime" });
      if (sample.status !== "success") {
        throw new Error(formatWarmPrimeFailure(scenario.id, sample));
      }
    },
    execute,
    cleanup: async (fixture, context) => {
      const receipt = await fixtureController.cleanup(fixture, context, scenario);
      if (
        receipt?.cleaned !== true ||
        receipt?.captureId !== context.captureId ||
        receipt?.cohortId !== context.cohortId ||
        !receipt?.receiptId
      ) {
        throw new Error(`${scenario.id} controlled cohort cleanup was not acknowledged`);
      }
      return {
        controlled: true,
        captureId: receipt.captureId,
        cohortId: receipt.cohortId,
        receiptId: receipt.receiptId,
        cleanedAt: receipt.cleanedAt,
      };
    },
  };
}

function createRemoteHttpFixtureController(scenario, env, fetchImpl) {
  const request = (suffix, method, body, context) => {
    const url = `${stripTrailingSlash(env.VELO_BENCHMARK_CONTROL_URL)}${scenario.controlPath}${suffix}`;
    const serialized = JSON.stringify(body);
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const bodySha256 = createHash("sha256").update(serialized).digest("hex");
    const canonical = [
      method,
      new URL(url).pathname,
      timestamp,
      nonce,
      bodySha256,
      context.captureId,
      env.VELO_BENCHMARK_AUTHORIZATION_ID,
    ].join("\n");
    return fetchJson(
      fetchImpl,
      url,
      {
        method,
        body: serialized,
        headers: {
          authorization: `Bearer ${env.VELO_BENCHMARK_CONTROL_TOKEN}`,
          "content-type": "application/json",
          "x-velo-benchmark-authorization-id": env.VELO_BENCHMARK_AUTHORIZATION_ID,
          "x-velo-benchmark-capture-id": context.captureId,
          "x-velo-benchmark-timestamp": timestamp,
          "x-velo-benchmark-nonce": nonce,
          "x-velo-benchmark-content-sha256": bodySha256,
          "x-velo-benchmark-signature": createHmac("sha256", env.VELO_BENCHMARK_CONTROL_SECRET)
            .update(canonical)
            .digest("hex"),
        },
      },
      context.timeoutMs,
    );
  };
  return {
    setup: (context) =>
      request(
        "/setup",
        "POST",
        {
          captureId: context.captureId,
          cohortId: context.cohortId,
          runId: context.runId,
          scenario: scenario.id,
          profile: context.profile,
          temperature: context.temperature,
          window: context.window,
          targetSamples: context.targetSamples,
          evidenceMode: "real",
        },
        context,
      ),
    resetBeforeSample: async (fixture, context) => {
      const response = await request(
        "/reset",
        "POST",
        {
          captureId: context.captureId,
          cohortId: context.cohortId,
          fixtureId: fixture.fixtureId,
          runId: context.runId,
          sample: context.sample,
          scenario: scenario.id,
        },
        context,
      );
      return response.coldResetEvidence;
    },
    cleanup: (fixture, context) =>
      request(
        "/cleanup",
        "DELETE",
        {
          captureId: context.captureId,
          cohortId: context.cohortId,
          fixtureId: fixture.fixtureId,
          cleanupToken: fixture.cleanupToken,
          runId: context.runId,
          scenario: scenario.id,
        },
        context,
      ),
  };
}

function createControlAdapter(scenario, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const request = (suffix, init, context) => {
    const url = `${stripTrailingSlash(env.VELO_BENCHMARK_CONTROL_URL)}${scenario.controlPath}${suffix}`;
    const method = init.method ?? "GET";
    const body = init.body ?? "";
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const bodySha256 = createHash("sha256").update(body).digest("hex");
    const canonical = [
      method,
      new URL(url).pathname,
      timestamp,
      nonce,
      bodySha256,
      context.captureId,
      env.VELO_BENCHMARK_AUTHORIZATION_ID,
    ].join("\n");
    const signature = createHmac("sha256", env.VELO_BENCHMARK_CONTROL_SECRET)
      .update(canonical)
      .digest("hex");
    return fetchJson(
      fetchImpl,
      url,
      {
        ...init,
        headers: {
          authorization: `Bearer ${env.VELO_BENCHMARK_CONTROL_TOKEN}`,
          "content-type": "application/json",
          "x-velo-benchmark-authorization-id": env.VELO_BENCHMARK_AUTHORIZATION_ID,
          "x-velo-benchmark-capture-id": context.captureId,
          "x-velo-benchmark-timestamp": timestamp,
          "x-velo-benchmark-nonce": nonce,
          "x-velo-benchmark-content-sha256": bodySha256,
          "x-velo-benchmark-signature": signature,
        },
      },
      context.timeoutMs,
    );
  };
  return {
    id: scenario.id,
    setup: async (context) => {
      requireEnvironment(scenario.requiredEnv, env, scenario.id);
      assertAuthorizedUrl(env.VELO_BENCHMARK_CONTROL_URL, env);
      const response = await request(
        "/setup",
        {
          method: "POST",
          body: JSON.stringify({
            captureId: context.captureId,
            cohortId: context.cohortId,
            runId: context.runId,
            scenario: scenario.id,
            profile: context.profile,
            temperature: context.temperature,
            window: context.window,
            targetSamples: context.targetSamples,
            evidenceMode: "real",
          }),
        },
        context,
      );
      if (
        response.authorized !== true ||
        response.authorizationId !== env.VELO_BENCHMARK_AUTHORIZATION_ID ||
        response.cohortId !== context.cohortId ||
        response.evidenceMode !== "real"
      ) {
        throw new Error(`${scenario.id} control did not authorize real-path evidence`);
      }
      if (!response.fixtureId)
        throw new Error(`${scenario.id} control returned no scoped fixtureId`);
      if (!response.setupReceiptId)
        throw new Error(`${scenario.id} control returned no setup receipt`);
      if (
        response.temperatureApplied !== context.temperature ||
        response.profileApplied !== context.profile
      ) {
        throw new Error(`${scenario.id} control did not apply the requested profile/temperature`);
      }
      const clockErrors = validateClockProvenance(response.clockProvenance);
      if (clockErrors.length)
        throw new Error(`${scenario.id} invalid clock provenance: ${clockErrors.join("; ")}`);
      return {
        fixtureId: response.fixtureId,
        evidenceMode: "real",
        clockProvenance: response.clockProvenance,
        temperatureApplied: response.temperatureApplied,
        profileApplied: response.profileApplied,
        fixtureControl: {
          authorized: true,
          cohortId: response.cohortId,
          setupReceiptId: response.setupReceiptId,
        },
      };
    },
    prime: async (fixture, context) => {
      if (context.temperature !== "warm") return;
      const response = await request(
        "/prime",
        {
          method: "POST",
          body: JSON.stringify({
            captureId: context.captureId,
            cohortId: context.cohortId,
            fixtureId: fixture.fixtureId,
            runId: context.runId,
            scenario: scenario.id,
            profile: context.profile,
            temperature: context.temperature,
          }),
        },
        context,
      );
      if (response.primed !== true || response.evidenceMode !== "real") {
        throw new Error(`${scenario.id} warm prime was not applied`);
      }
    },
    execute: async (fixture, context) => {
      const runnerStartedAt = performance.now();
      try {
        const response = await request(
          "/execute",
          {
            method: "POST",
            body: JSON.stringify({
              captureId: context.captureId,
              cohortId: context.cohortId,
              fixtureId: fixture.fixtureId,
              runId: context.runId,
              sample: context.sample,
              scenario: scenario.id,
              profile: context.profile,
              temperature: context.temperature,
              window: context.window,
              evidenceMode: "real",
            }),
          },
          context,
        );
        const runnerEndedAt = performance.now();
        const sample = sanitizeControlSample(response, context, runnerStartedAt, runnerEndedAt);
        if (context.temperature === "cold") {
          try {
            sample.coldResetEvidence = verifyColdResetEvidence(
              response.coldResetEvidence,
              context,
              env.VELO_BENCHMARK_CONTROL_SECRET,
              env.VELO_BENCHMARK_AUTHORIZATION_ID,
            );
          } catch (error) {
            return {
              ...sample,
              status: "error",
              errorDetail: {
                class: "authorization",
                code: "invalid_cold_reset_evidence",
                errors: [error instanceof Error ? error.message : "cold reset verification failed"],
              },
            };
          }
        }
        const errors = validateLifecycleSample(sample, scenario, fixture.clockProvenance);
        if (errors.length) {
          return {
            ...sample,
            status: "error",
            errorDetail: { class: "lifecycle", code: "invalid_evidence", errors },
          };
        }
        return sample;
      } catch (error) {
        return {
          sample: context.sample,
          status: "error",
          evidenceMode: "real",
          lifecycle: [],
          metrics: [],
          errorDetail: {
            class: error?.name === "AbortError" ? "timeout" : "network",
            code: error instanceof Error ? error.name : "control_request_failed",
          },
        };
      }
    },
    cleanup: async (fixture, context) => {
      const response = await request(
        "/cleanup",
        {
          method: "DELETE",
          body: JSON.stringify({
            captureId: context.captureId,
            cohortId: context.cohortId,
            fixtureId: fixture.fixtureId,
            runId: context.runId,
            scenario: scenario.id,
          }),
        },
        context,
      );
      if (
        response.cleaned !== true ||
        response.captureId !== context.captureId ||
        response.cohortId !== context.cohortId ||
        !response.receiptId
      )
        throw new Error(`${scenario.id} scoped fixture cleanup failed`);
      return {
        controlled: true,
        captureId: response.captureId,
        cohortId: response.cohortId,
        receiptId: response.receiptId,
        cleanedAt: response.cleanedAt,
      };
    },
  };
}

function sanitizeControlSample(response, context, runnerStartedAt, runnerEndedAt) {
  return {
    sample: context.sample,
    captureId: context.captureId,
    cohortId: context.cohortId,
    status: response.status,
    evidenceMode: response.evidenceMode,
    correlationId: response.correlationId ?? null,
    lifecycle: Array.isArray(response.lifecycle) ? response.lifecycle : [],
    metrics: Array.isArray(response.metrics) ? response.metrics : [],
    dependencyTimings: Array.isArray(response.dependencyTimings) ? response.dependencyTimings : [],
    queueDepth: Number.isFinite(response.queueDepth) ? response.queueDepth : null,
    eventLagMs: Number.isFinite(response.eventLagMs) ? response.eventLagMs : null,
    retryCount: Number.isInteger(response.retryCount) ? response.retryCount : 0,
    timeout: response.timeout === true,
    runner: {
      startedAtMonotonicMs: runnerStartedAt,
      endedAtMonotonicMs: runnerEndedAt,
      durationMs: round(runnerEndedAt - runnerStartedAt),
    },
    ...(response.error
      ? {
          error: {
            class: safeString(response.error.class),
            code: safeString(response.error.code),
            dependency: safeString(response.error.dependency),
            source: safeString(response.error.source),
            attributed: response.error.attributed === true,
          },
        }
      : {}),
  };
}

async function readHttpOutcome(response, scenario) {
  const errors = [];
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(scenario.outcome.contentType)) {
    errors.push(`content-type must include ${scenario.outcome.contentType}`);
    return { errors };
  }
  let value;
  try {
    value = await response.json();
  } catch {
    return { errors: ["response body must be valid JSON"] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value, errors: ["response body must be an object"] };
  }
  for (const [key, expectation] of Object.entries(scenario.outcome.required)) {
    const actual = value[key];
    const valid =
      expectation === "string"
        ? typeof actual === "string" && actual.length > 0
        : expectation === "array"
          ? Array.isArray(actual)
          : expectation === "boolean"
            ? typeof actual === "boolean"
            : expectation === "string|null"
              ? actual === null || typeof actual === "string"
              : actual === expectation;
    if (!valid) errors.push(`response.${key} must match ${expectation}`);
  }
  return { value, errors };
}

function verifyColdResetEvidence(evidence, context, secret, authorizationId) {
  if (!secret) throw new Error("cold reset verification secret is missing");
  const candidate = {
    applied: evidence?.applied,
    resetId: safeString(evidence?.resetId),
    method: safeString(evidence?.method),
    authorizationId: safeString(evidence?.authorizationId),
    captureId: safeString(evidence?.captureId),
    cohortId: safeString(evidence?.cohortId),
    sample: evidence?.sample,
    resetAtEpochMs: evidence?.resetAtEpochMs,
    attestation: {
      algorithm: evidence?.attestation?.algorithm,
      payloadSha256: evidence?.attestation?.payloadSha256,
      signature: evidence?.attestation?.signature,
      verified: false,
    },
  };
  if (
    candidate.applied !== true ||
    !candidate.resetId ||
    !candidate.method ||
    !Number.isFinite(candidate.resetAtEpochMs) ||
    candidate.authorizationId !== authorizationId ||
    candidate.captureId !== context.captureId ||
    candidate.cohortId !== context.cohortId ||
    String(candidate.sample) !== String(context.sample)
  ) {
    throw new Error("cold reset evidence is not bound to the authorized sample");
  }
  const payload = coldResetPayload(candidate);
  const payloadSha256 = createHash("sha256").update(payload).digest("hex");
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(candidate.attestation.signature ?? "", "hex");
  } catch {
    throw new Error("cold reset signature is malformed");
  }
  if (
    candidate.attestation.algorithm !== "hmac-sha256" ||
    candidate.attestation.payloadSha256 !== payloadSha256 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    throw new Error("cold reset attestation signature is invalid");
  }
  candidate.attestation.verified = true;
  return candidate;
}

async function fetchJson(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`benchmark control returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json"))
      throw new Error("benchmark control returned non-JSON data");
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function requireEnvironment(names = [], env, scenarioId) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`${scenarioId} missing required benchmark environment: ${missing.join(", ")}`);
  }
}

function assertAuthorizedUrl(value, env) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("benchmark endpoint must be a valid URL");
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (
    url.protocol !== "https:" &&
    !(local && env.VELO_BENCHMARK_ALLOW_INSECURE_LOCALHOST === "1")
  ) {
    throw new Error("benchmark capture endpoints must use HTTPS");
  }
  if (url.username || url.password)
    throw new Error("benchmark endpoint URL must not contain credentials");
}

function replaceVariables(headers, values) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      String(value).replace(/\$\{(RUN_ID|SAMPLE)\}/g, (_, name) => values[name]),
    ]),
  );
}

function classifyHttpError(status, headers) {
  const errorClass =
    status >= 400 && status < 500
      ? "http_4xx"
      : status === 503
        ? "http_5xx_503"
        : status >= 500
          ? "http_5xx"
          : "unknown";
  const dependency = headers.get("x-error-dependency");
  const source = headers.get("x-error-source");
  return {
    class: errorClass,
    code: headers.get("x-error-code"),
    dependency,
    source,
    attributed: Boolean(dependency || source),
  };
}

function formatWarmPrimeFailure(scenarioId, sample) {
  const failure = sample.errorDetail ?? sample.error;
  const details = [
    sample.httpStatus > 0 ? `HTTP ${sample.httpStatus}` : null,
    sample.timeout ? "request timed out" : null,
    failure?.class ? `class=${failure.class}` : null,
    failure?.code ? `code=${failure.code}` : null,
    ...(sample.errorDetail?.errors ?? []),
  ].filter(Boolean);
  return `${scenarioId} warm prime failed${details.length ? `: ${details.join("; ")}` : ""}`;
}

function safeString(value) {
  return typeof value === "string" ? value.slice(0, 160) : null;
}

function stripTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

function round(value) {
  return Math.round(value * 100) / 100;
}
