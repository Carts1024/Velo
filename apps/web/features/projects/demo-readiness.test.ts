import assert from "node:assert/strict";
import test from "node:test";

import { getDemoReadiness } from "./demo-readiness.ts";

test("getDemoReadiness keeps incomplete demo steps actionable", () => {
  const readiness = getDemoReadiness({
    project: {
      status: "draft",
      registrationTxHash: undefined,
      registryProjectId: undefined,
      slug: "demopay",
    },
    activeContractCount: 0,
    eventCount: 0,
    webhookConfigured: false,
    deliveryCount: 0,
  });

  assert.equal(readiness.completedCount, 1);
  assert.equal(readiness.totalCount, 6);
  assert.equal(readiness.items.find((item) => item.id === "register")?.complete, false);
  assert.equal(readiness.items.find((item) => item.id === "webhook")?.href, "webhooks");
});

test("getDemoReadiness marks the end-to-end DemoPay journey complete", () => {
  const readiness = getDemoReadiness({
    project: {
      status: "registered",
      registrationTxHash: "a".repeat(64),
      registryProjectId: 7,
      slug: "demopay",
    },
    activeContractCount: 1,
    eventCount: 3,
    webhookConfigured: true,
    deliveryCount: 1,
  });

  assert.equal(readiness.completedCount, readiness.totalCount);
  assert.equal(readiness.percent, 100);
  assert.ok(readiness.items.every((item) => item.complete));
});
