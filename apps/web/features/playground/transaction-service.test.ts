import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_FEE,
  Account,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  SorobanDataBuilder,
  StrKey,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import {
  assertHelloSymbol,
  normalizeTransactionStatusResponse,
  normalizeSimulationRequest,
  parseHelloTransactionReview,
  parseTransactionReview,
  PlaygroundSimulationService,
  redactSimulationEvidence,
  submitPlaygroundTransaction,
  verifySignedTransaction,
} from "./server/transaction-service.ts";

const sourceKeypair = Keypair.random();
const source = sourceKeypair.publicKey();
const contractId = StrKey.encodeContract(Keypair.random().rawPublicKey());
const fixture = {
  network: "testnet" as const,
  contractId,
  wasmHash: "ab".repeat(32),
  functionName: "hello" as const,
};

function transactionResultXdr(feeCharged = "123") {
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString(feeCharged),
    result: xdr.TransactionResultResult.txSuccess([]),
    ext: new xdr.TransactionResultExt(0),
  });
}

function transactionMetaXdr() {
  return new xdr.TransactionMeta(0, []);
}

function transaction(argument = "Velo") {
  return new TransactionBuilder(new Account(source, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(contractId).call("hello", nativeToScVal(argument, { type: "symbol" })),
    )
    .setTimeout(300)
    .build();
}

function signedEnvelopeXdr() {
  const signed = transaction();
  signed.sign(sourceKeypair);
  return signed.toEnvelope();
}

function customTransaction({
  sourceAccount = source,
  sequence = "1",
  fee = "100",
  maxTime = 300,
  targetContract = contractId,
  functionName = "hello",
  operations = 1,
  networkPassphrase = Networks.TESTNET,
}: {
  sourceAccount?: string;
  sequence?: string;
  fee?: string;
  maxTime?: number;
  targetContract?: string;
  functionName?: string;
  operations?: number;
  networkPassphrase?: string;
} = {}) {
  const builder = new TransactionBuilder(new Account(sourceAccount, sequence), {
    fee,
    networkPassphrase,
  });
  for (let index = 0; index < operations; index += 1) {
    builder.addOperation(
      new Contract(targetContract).call(functionName, nativeToScVal("Velo", { type: "symbol" })),
    );
  }
  return builder.setTimeout(maxTime).build();
}

test("validates canonical Soroban Symbol arguments", () => {
  assert.equal(assertHelloSymbol("Velo_2026"), "Velo_2026");
  assert.throws(() => assertHelloSymbol(""));
  assert.throws(() => assertHelloSymbol("not allowed"));
  assert.throws(() => assertHelloSymbol("x".repeat(33)));
});

test("derives every review field from the exact unsigned XDR", () => {
  const tx = transaction();
  const review = parseHelloTransactionReview(tx, fixture);
  assert.equal(review.network, "testnet");
  assert.equal(review.sourceAccount, source);
  assert.equal(review.contractId, contractId);
  assert.equal(review.functionName, "hello");
  assert.deepEqual(review.arguments, [{ name: "to", type: "symbol", value: "Velo" }]);
  assert.equal(review.transactionHash, tx.hash().toString("hex"));
  assert.equal(review.totalFee, tx.fee);
});

test("signed envelope verification rejects a different reviewed transaction hash", () => {
  const tx = transaction();
  tx.sign(sourceKeypair);
  assert.doesNotThrow(() =>
    verifySignedTransaction(tx.toXDR(), tx.hash().toString("hex"), fixture),
  );
  assert.throws(() => verifySignedTransaction(tx.toXDR(), "00".repeat(32), fixture));
});

test("rejects a signature that does not belong to the source account", () => {
  const tx = transaction();
  tx.sign(Keypair.random());
  assert.throws(() => verifySignedTransaction(tx.toXDR(), tx.hash().toString("hex"), fixture));
});

test("operation or argument mutation changes the reviewed hash", () => {
  const original = transaction("Velo");
  const changed = transaction("Other");
  assert.notEqual(original.hash().toString("hex"), changed.hash().toString("hex"));
  assert.throws(() =>
    verifySignedTransaction(changed.toXDR(), original.hash().toString("hex"), fixture),
  );
});

test("rejects wrong contract, function, and operation count", () => {
  const otherContract = StrKey.encodeContract(Keypair.random().rawPublicKey());
  assert.throws(() =>
    parseHelloTransactionReview(customTransaction({ targetContract: otherContract }), fixture),
  );
  assert.throws(() =>
    parseHelloTransactionReview(customTransaction({ functionName: "other" }), fixture),
  );
  assert.throws(() => parseHelloTransactionReview(customTransaction({ operations: 2 }), fixture));
});

test("source, sequence, fee, and time-bound mutations alter the exact hash", () => {
  const baseline = customTransaction();
  const baselineHash = baseline.hash().toString("hex");
  const variants = [
    customTransaction({ sourceAccount: Keypair.random().publicKey() }),
    customTransaction({ sequence: "2" }),
    customTransaction({ fee: "200" }),
    customTransaction({ maxTime: 120 }),
  ];
  for (const variant of variants) {
    variant.sign(Keypair.random());
    assert.notEqual(variant.hash().toString("hex"), baselineHash);
    assert.throws(() => verifySignedTransaction(variant.toXDR(), baselineHash, fixture));
  }
});

test("Mainnet is accepted for generalized simulation context", () => {
  const normalized = normalizeSimulationRequest({
    network: "mainnet",
    contractId,
    expectedWasmHash: "ab".repeat(32),
    expectedSpecHash: "cd".repeat(32),
    sourceAccount: source,
    functionName: "hello",
    arguments: { to: "Velo" },
  });
  assert.equal(normalized.network, "mainnet");
});

test("Mainnet submission is rejected before envelope, fixture, or RPC work", async () => {
  await assert.rejects(
    submitPlaygroundTransaction(
      {
        network: "mainnet",
        signedXdr: "not-an-envelope",
        reviewedTransactionHash: "00".repeat(32),
        expectedWasmHash: "ab".repeat(32),
      },
      "corr-mainnet-submit",
    ),
    /simulation-only/,
  );
});

test("normalizes generalized and legacy simulation requests", () => {
  const generalized = normalizeSimulationRequest({
    network: "testnet",
    contractId,
    expectedWasmHash: "AB".repeat(32),
    expectedSpecHash: "CD".repeat(32),
    sourceAccount: source.toLowerCase(),
    functionName: "echo",
    arguments: { amount: "9007199254740993" },
    settings: { baseFee: "200", cpuInstructions: 5000 },
  });
  assert.equal(generalized.contractId, contractId);
  assert.equal(generalized.sourceAccount, source);
  assert.equal(generalized.expectedWasmHash, "ab".repeat(32));
  assert.deepEqual(generalized.settings, { baseFee: "200", cpuInstructions: 5000 });

  const legacy = normalizeSimulationRequest(
    {
      network: "testnet",
      contractId,
      sourceAccount: source,
      argument: "Velo",
    },
    fixture,
  );
  assert.equal(legacy.functionName, "hello");
  assert.deepEqual(legacy.arguments, { to: "Velo" });
  assert.equal(legacy.settings.baseFee, BASE_FEE);
});

test("simulation request validation rejects unsafe settings and malformed hashes", () => {
  const base = {
    network: "testnet",
    contractId,
    expectedWasmHash: "ab".repeat(32),
    expectedSpecHash: "cd".repeat(32),
    sourceAccount: source,
    functionName: "hello",
    arguments: { to: "Velo" },
  };
  assert.throws(() => normalizeSimulationRequest({ ...base, expectedWasmHash: "not-a-hash" }));
  assert.throws(() =>
    normalizeSimulationRequest({ ...base, settings: { baseFee: "99", cpuInstructions: 0 } }),
  );
  assert.throws(() =>
    normalizeSimulationRequest({
      ...base,
      settings: { baseFee: "100", cpuInstructions: -1 },
    }),
  );
});

test("diagnostic evidence redacts secret seeds and configured secret-looking fields", () => {
  const secretSeed = Keypair.random().secret();
  const redacted = redactSimulationEvidence(
    {
      safe: "visible",
      privateKey: secretSeed,
      nested: { token: "bearer-value", memo: secretSeed },
      authorizationEntries: ["AAAA"],
    },
    ["token"],
  );
  assert.deepEqual(redacted, {
    safe: "visible",
    privateKey: "[REDACTED]",
    nested: { token: "[REDACTED]", memo: "[REDACTED]" },
    authorizationEntries: ["AAAA"],
  });
  assert.doesNotMatch(JSON.stringify(redacted), new RegExp(secretSeed));
});

test("generalized service encodes ordered arguments and explains preflight evidence", async () => {
  let simulatedArguments: string[] = [];
  let cpuLeeway = -1;
  const document = {
    schemaVersion: 1 as const,
    network: "testnet" as const,
    contractId,
    wasmHash: fixture.wasmHash,
    specHash: "cd".repeat(32),
    latestLedger: 100,
    loadedAt: "2026-07-23T00:00:00.000Z",
    correlationId: "load",
    rawEntries: [],
    functions: [
      {
        name: "echo",
        documentation: "",
        parameters: [
          { name: "label", documentation: "", type: { kind: "symbol" as const } },
          { name: "count", documentation: "", type: { kind: "u64" as const } },
        ],
        outputs: [{ index: 0, type: { kind: "symbol" as const } }],
        source: { index: 0, xdr: "" },
      },
    ],
    customTypes: [],
    errors: [],
    events: [],
  };
  const transactionData = new SorobanDataBuilder()
    .setResourceFee("10000001")
    .setResources(1000, 0, 0)
    .setFootprint([], []);
  const authorizationEntry = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Contract(contractId).address().toScAddress(),
          functionName: "echo",
          args: [],
        }),
      ),
      subInvocations: [],
    }),
  });
  const service = new PlaygroundSimulationService({
    loadContract: async () => document,
    loadSourceAccount: async () => ({
      account: new Account(source, "1"),
      balance: 50n,
    }),
    async simulate(transaction, cpuInstructions) {
      const operation = transaction.operations[0]!;
      assert.equal(operation.type, "invokeHostFunction");
      if (operation.type !== "invokeHostFunction") throw new Error("expected invocation");
      const invocation = operation.func.invokeContract();
      simulatedArguments = invocation.args().map((value) => value.toXDR("base64"));
      cpuLeeway = cpuInstructions;
      return {
        id: "rpc-1",
        latestLedger: 101,
        events: [],
        _parsed: true,
        transactionData,
        minResourceFee: "10000001",
        result: {
          auth: [authorizationEntry],
          retval: nativeToScVal("done", { type: "symbol" }),
        },
        stateChanges: [],
      } satisfies rpc.Api.SimulateTransactionSuccessResponse;
    },
    assemble: (transaction) =>
      TransactionBuilder.cloneFrom(transaction, { fee: "10000101" }).build(),
    helloFixture: () => null,
    now: () => Date.parse("2026-07-23T00:00:00.000Z"),
  });
  const response = await service.simulate(
    {
      network: "testnet",
      contractId,
      expectedWasmHash: fixture.wasmHash,
      expectedSpecHash: document.specHash,
      sourceAccount: source,
      functionName: "echo",
      arguments: { count: "9", label: "Velo" },
      settings: { baseFee: "100", cpuInstructions: 5000 },
    },
    "corr-1",
  );

  assert.deepEqual(simulatedArguments, [
    nativeToScVal("Velo", { type: "symbol" }).toXDR("base64"),
    nativeToScVal(9n, { type: "u64" }).toXDR("base64"),
  ]);
  assert.equal(cpuLeeway, 5000);
  assert.equal(response.result.decoded, "done");
  assert.equal(response.fee.minimumResource, "10000001");
  assert.equal(response.latestLedger, 101);
  assert.equal(response.footprint.readWrite.length, 0);
  assert.equal(response.authorization.entries.length, 1);
  assert.equal(response.signingEligible, true);
  assert.equal(response.review.transactionHash, response.transactionHash);
  assert.equal(response.review.unsignedXdr, response.unsignedXdr);
  assert.deepEqual(response.review.arguments, [
    { name: "label", type: "symbol", value: "Velo" },
    { name: "count", type: "u64", value: "9" },
  ]);
  assert.ok(response.warnings.some((warning) => warning.code === "AUTHORIZATION_REQUIRED"));
  assert.ok(response.warnings.some((warning) => warning.code === "NO_WRITES"));
  assert.ok(response.warnings.some((warning) => warning.code === "EXCESSIVE_FEE"));
  assert.ok(response.warnings.some((warning) => warning.code === "INSUFFICIENT_FEE_BALANCE"));
  assert.ok(response.warnings.some((warning) => warning.code === "EXECUTION_NOT_GUARANTEED"));
});

test("generic review derives call, decoded arguments, and exact fingerprint from XDR", () => {
  const document = {
    schemaVersion: 1 as const,
    network: "testnet" as const,
    contractId,
    wasmHash: fixture.wasmHash,
    specHash: "cd".repeat(32),
    latestLedger: 100,
    loadedAt: "2026-07-23T00:00:00.000Z",
    correlationId: "load",
    rawEntries: [],
    functions: [
      {
        name: "hello",
        documentation: "",
        parameters: [{ name: "to", documentation: "", type: { kind: "symbol" as const } }],
        outputs: [],
        source: { index: 0, xdr: "" },
      },
    ],
    customTypes: [],
    errors: [],
    events: [],
  };
  const tx = transaction();
  const review = parseTransactionReview(tx, "testnet", document);
  assert.equal(review.contractId, contractId);
  assert.equal(review.functionName, "hello");
  assert.deepEqual(review.arguments, [{ name: "to", type: "symbol", value: "Velo" }]);
  assert.equal(review.unsignedXdr, tx.toXDR());
  assert.equal(review.transactionHash, tx.hash().toString("hex"));
});

test("generic review uses the request base fee when separating resource fee", () => {
  const document = {
    schemaVersion: 1 as const,
    network: "testnet" as const,
    contractId,
    wasmHash: fixture.wasmHash,
    specHash: "cd".repeat(32),
    latestLedger: 100,
    loadedAt: "2026-07-23T00:00:00.000Z",
    correlationId: "load",
    rawEntries: [],
    functions: [
      {
        name: "hello",
        documentation: "",
        parameters: [{ name: "to", documentation: "", type: { kind: "symbol" as const } }],
        outputs: [],
        source: { index: 0, xdr: "" },
      },
    ],
    customTypes: [],
    errors: [],
    events: [],
  };
  const tx = customTransaction({ fee: "725" });
  const review = parseTransactionReview(tx, "testnet", document, [], [], "225");
  assert.equal(review.baseFee, "225");
  assert.equal(review.totalFee, "725");
  assert.equal(review.resourceFee, "500");
});

test("transaction response normalizer preserves pending identity", () => {
  const transactionHash = "ab".repeat(32);
  const normalized = normalizeTransactionStatusResponse(
    {
      status: rpc.Api.GetTransactionStatus.NOT_FOUND,
      txHash: transactionHash,
      latestLedger: 100,
      latestLedgerCloseTime: 0,
      oldestLedger: 1,
      oldestLedgerCloseTime: 0,
    },
    transactionHash,
  );
  assert.deepEqual(normalized, { status: "pending", transactionHash });
});

test("transaction response normalizer returns failed execution evidence without an envelope", () => {
  const transactionHash = "bc".repeat(32);
  const resultXdr = transactionResultXdr("321");
  const resultMetaXdr = transactionMetaXdr();
  const normalized = normalizeTransactionStatusResponse(
    {
      status: rpc.Api.GetTransactionStatus.FAILED,
      txHash: transactionHash,
      latestLedger: 201,
      latestLedgerCloseTime: 0,
      oldestLedger: 1,
      oldestLedgerCloseTime: 0,
      ledger: 200,
      createdAt: 0,
      applicationOrder: 1,
      feeBump: false,
      envelopeXdr: signedEnvelopeXdr(),
      resultXdr,
      resultMetaXdr,
      diagnosticEventsXdr: [],
      events: { transactionEventsXdr: [], contractEventsXdr: [] },
    },
    transactionHash,
  );
  assert.equal(normalized.status, "failed");
  if (normalized.status !== "failed") return;
  assert.equal(normalized.stage, "execution");
  assert.equal(normalized.ledger, 200);
  assert.equal(normalized.evidence.resultXdr, resultXdr.toXDR("base64"));
  assert.equal(normalized.evidence.resultMetaXdr, resultMetaXdr.toXDR("base64"));
  assert.equal("envelopeXdr" in normalized, false);
  assert.equal("signedXdr" in normalized, false);
});

test("transaction response normalizer decodes success, events, fees, and raw evidence", () => {
  const transactionHash = "cd".repeat(32);
  const resultXdr = transactionResultXdr("456");
  const resultMetaXdr = transactionMetaXdr();
  const event = new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    contractId: new Contract(contractId).address().toScAddress().contractId(),
    type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(
      0,
      new xdr.ContractEventV0({
        topics: [nativeToScVal("paid", { type: "symbol" })],
        data: nativeToScVal(7n, { type: "u64" }),
      }),
    ),
  });
  const returnValue = nativeToScVal("done", { type: "symbol" });
  const normalized = normalizeTransactionStatusResponse(
    {
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      txHash: transactionHash,
      latestLedger: 301,
      latestLedgerCloseTime: 0,
      oldestLedger: 1,
      oldestLedgerCloseTime: 0,
      ledger: 300,
      createdAt: 0,
      applicationOrder: 1,
      feeBump: false,
      envelopeXdr: signedEnvelopeXdr(),
      resultXdr,
      resultMetaXdr,
      diagnosticEventsXdr: [],
      returnValue,
      events: { transactionEventsXdr: [], contractEventsXdr: [[event]] },
    },
    transactionHash,
  );
  assert.equal(normalized.status, "success");
  if (normalized.status !== "success") return;
  assert.deepEqual(normalized.result, {
    decoded: "done",
    rawXdr: returnValue.toXDR("base64"),
  });
  assert.equal(normalized.feeCharged, "456");
  assert.equal(normalized.ledger, 300);
  assert.equal(
    normalized.explorerUrl,
    `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
  );
  assert.deepEqual(normalized.events[0]?.topics, ["paid"]);
  assert.equal(normalized.events[0]?.data, "7");
  assert.equal(normalized.events[0]?.contractId, contractId);
  assert.equal(normalized.events[0]?.rawXdr, event.toXDR("base64"));
  assert.equal(normalized.evidence.resultXdr, resultXdr.toXDR("base64"));
  assert.equal(normalized.evidence.resultMetaXdr, resultMetaXdr.toXDR("base64"));
  assert.equal("envelopeXdr" in normalized, false);
  assert.equal("signedXdr" in normalized, false);
});

test("transaction response normalizer keeps raw return XDR when native decoding fails", () => {
  const transactionHash = "de".repeat(32);
  const returnValue = xdr.ScVal.scvLedgerKeyContractInstance();
  const normalized = normalizeTransactionStatusResponse(
    {
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      txHash: transactionHash,
      latestLedger: 401,
      latestLedgerCloseTime: 0,
      oldestLedger: 1,
      oldestLedgerCloseTime: 0,
      ledger: 400,
      createdAt: 0,
      applicationOrder: 1,
      feeBump: false,
      envelopeXdr: signedEnvelopeXdr(),
      resultXdr: transactionResultXdr(),
      resultMetaXdr: transactionMetaXdr(),
      diagnosticEventsXdr: [],
      returnValue,
      events: { transactionEventsXdr: [], contractEventsXdr: [] },
    },
    transactionHash,
  );
  assert.equal(normalized.status, "success");
  if (normalized.status !== "success") return;
  assert.deepEqual(normalized.result, {
    decoded: null,
    rawXdr: returnValue.toXDR("base64"),
  });
});

test("contract hash drift stops simulation before source-account or RPC work", async () => {
  let rpcCalled = false;
  const service = new PlaygroundSimulationService({
    loadContract: async () => ({
      schemaVersion: 1,
      network: "testnet",
      contractId,
      wasmHash: "ef".repeat(32),
      specHash: "cd".repeat(32),
      latestLedger: 10,
      loadedAt: "2026-07-23T00:00:00.000Z",
      correlationId: "load",
      rawEntries: [],
      functions: [],
      customTypes: [],
      errors: [],
      events: [],
    }),
    loadSourceAccount: async () => {
      rpcCalled = true;
      throw new Error("must not run");
    },
    simulate: async () => {
      rpcCalled = true;
      throw new Error("must not run");
    },
    assemble: (transaction) => transaction,
    helloFixture: () => null,
    now: Date.now,
  });
  await assert.rejects(
    service.simulate(
      {
        network: "testnet",
        contractId,
        expectedWasmHash: fixture.wasmHash,
        expectedSpecHash: "cd".repeat(32),
        sourceAccount: source,
        functionName: "hello",
        arguments: { to: "Velo" },
      },
      "corr-drift",
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "ContractSpecError" &&
      /changed after it was loaded/.test(error.message),
  );
  assert.equal(rpcCalled, false);
});

test("restore preambles remain inspectable but cannot become signable", async () => {
  const document = {
    schemaVersion: 1 as const,
    network: "testnet" as const,
    contractId,
    wasmHash: fixture.wasmHash,
    specHash: "cd".repeat(32),
    latestLedger: 100,
    loadedAt: "2026-07-23T00:00:00.000Z",
    correlationId: "load",
    rawEntries: [],
    functions: [
      {
        name: "hello",
        documentation: "",
        parameters: [{ name: "to", documentation: "", type: { kind: "symbol" as const } }],
        outputs: [{ index: 0, type: { kind: "symbol" as const } }],
        source: { index: 0, xdr: "" },
      },
    ],
    customTypes: [],
    errors: [],
    events: [],
  };
  const transactionData = new SorobanDataBuilder().setFootprint([], []);
  const service = new PlaygroundSimulationService({
    loadContract: async () => document,
    loadSourceAccount: async () => ({
      account: new Account(source, "1"),
      balance: 1_000_000n,
    }),
    simulate: async () =>
      ({
        id: "rpc-restore",
        latestLedger: 101,
        events: [],
        _parsed: true,
        transactionData,
        minResourceFee: "100",
        result: { auth: [], retval: nativeToScVal("Velo", { type: "symbol" }) },
        restorePreamble: {
          minResourceFee: "50",
          transactionData,
        },
      }) satisfies rpc.Api.SimulateTransactionRestoreResponse,
    assemble: (transaction) => transaction,
    helloFixture: () => fixture,
    now: () => Date.parse("2026-07-23T00:00:00.000Z"),
  });
  const response = await service.simulate(
    {
      network: "testnet",
      contractId,
      expectedWasmHash: fixture.wasmHash,
      expectedSpecHash: document.specHash,
      sourceAccount: source,
      functionName: "hello",
      arguments: { to: "Velo" },
    },
    "corr-restore",
  );
  assert.equal(response.status, "restore_required");
  assert.equal(response.signingEligible, false);
  assert.equal(response.evidence.restorePreamble?.minResourceFee, "50");
  assert.ok(response.warnings.some((warning) => warning.code === "ARCHIVED_STATE"));
});

test("incomplete SDK success responses fail with bounded public diagnostics", async () => {
  const service = new PlaygroundSimulationService({
    loadContract: async () => ({
      schemaVersion: 1,
      network: "testnet",
      contractId,
      wasmHash: fixture.wasmHash,
      specHash: "cd".repeat(32),
      latestLedger: 100,
      loadedAt: "2026-07-23T00:00:00.000Z",
      correlationId: "load",
      rawEntries: [],
      functions: [
        {
          name: "ping",
          documentation: "",
          parameters: [],
          outputs: [],
          source: { index: 0, xdr: "" },
        },
      ],
      customTypes: [],
      errors: [],
      events: [],
    }),
    loadSourceAccount: async () => ({
      account: new Account(source, "1"),
      balance: 1_000_000n,
    }),
    simulate: async () =>
      ({
        id: "rpc-incomplete",
        latestLedger: 101,
        events: [],
        _parsed: true,
        minResourceFee: "100",
      }) as unknown as rpc.Api.SimulateTransactionSuccessResponse,
    assemble: (transaction) => transaction,
    helloFixture: () => null,
    now: Date.now,
  });
  await assert.rejects(
    service.simulate(
      {
        network: "testnet",
        contractId,
        expectedWasmHash: fixture.wasmHash,
        expectedSpecHash: "cd".repeat(32),
        sourceAccount: source,
        functionName: "ping",
        arguments: {},
      },
      "corr-incomplete",
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "SIMULATION_FAILED" &&
      "diagnostics" in error &&
      JSON.stringify(error.diagnostics).includes("rpc-incomplete"),
  );
});
