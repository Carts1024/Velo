import assert from "node:assert/strict";
import test from "node:test";

import { filterContractEvents, normalizeRpcEvent } from "./event-monitor.ts";

test("normalizeRpcEvent creates a dashboard-safe event record", () => {
  const normalized = normalizeRpcEvent({
    id: "000001-0000000001",
    type: "contract",
    ledger: 1234,
    ledgerClosedAt: "2026-06-14T01:02:03Z",
    transactionIndex: 2,
    operationIndex: 1,
    inSuccessfulContractCall: true,
    txHash: "a".repeat(64),
    contractId: { toString: () => "C" + "A".repeat(55) },
    topic: [{ value: "transfer" }, 7n],
    value: new Map([["amount", 25n]]),
  });

  assert.equal(normalized.eventId, "000001-0000000001");
  assert.equal(normalized.contractId, "C" + "A".repeat(55));
  assert.equal(normalized.transactionHash, "a".repeat(64));
  assert.equal(normalized.ledger, 1234);
  assert.equal(normalized.timestamp, Date.parse("2026-06-14T01:02:03Z"));
  assert.equal(normalized.topic, '{"value":"transfer"}');
  assert.deepEqual(normalized.decoded, { amount: "25" });
  assert.equal(normalized.raw.transactionIndex, 2);
});

test("normalizeRpcEvent rejects events without a contract ID", () => {
  assert.throws(
    () =>
      normalizeRpcEvent({
        id: "system-event",
        type: "system",
        ledger: 1,
        ledgerClosedAt: "2026-06-14T01:02:03Z",
        transactionIndex: 0,
        operationIndex: 0,
        inSuccessfulContractCall: true,
        txHash: "b".repeat(64),
        topic: [],
        value: null,
      }),
    /contract ID/,
  );
});

test("filterContractEvents applies all event monitor filters", () => {
  const events = [
    {
      eventId: "event-1",
      contractId: "CACTIVE",
      transactionHash: "a".repeat(64),
      ledger: 1234,
      timestamp: 1,
      topic: "transfer",
      topics: ["transfer"],
      type: "contract",
      decoded: { amount: "25" },
      raw: {},
    },
    {
      eventId: "event-2",
      contractId: "COTHER",
      transactionHash: "b".repeat(64),
      ledger: 1235,
      timestamp: 2,
      topic: "mint",
      topics: ["mint"],
      type: "diagnostic",
      decoded: { amount: "50" },
      raw: {},
    },
  ];

  assert.deepEqual(
    filterContractEvents(events, {
      contractId: "cactive",
      eventType: "TRANS",
      transactionHash: "AAAA",
      ledger: 1234,
    }),
    [events[0]],
  );
});

test("filterContractEvents ignores blank filters", () => {
  const events = [
    {
      eventId: "event-1",
      contractId: "CACTIVE",
      transactionHash: "a".repeat(64),
      ledger: 1234,
      topic: "transfer",
      topics: [],
      type: "contract",
      decoded: null,
      raw: {},
    },
  ];

  assert.deepEqual(
    filterContractEvents(events, {
      contractId: " ",
      eventType: "",
      transactionHash: " ",
    }),
    events,
  );
});
