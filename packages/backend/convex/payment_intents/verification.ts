import type { DebugOperation } from "@repo/stellar";

export type PaymentVerificationExpectation = {
  receiverAddress?: string;
  amount: string;
  asset: string;
  payerAddress?: string;
};

export type VerifiedPayment = {
  source: string;
  destination: string;
  amount: string;
  asset: string;
};

const STELLAR_DECIMAL_PLACES = 7;
const STROOPS_PER_UNIT = 10_000_000n;

function normalizeAddress(value: string) {
  return value.trim().toUpperCase();
}

function amountInStroops(value: string) {
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(value.trim());
  if (!match) return undefined;

  const whole = BigInt(match[1] ?? "0");
  const fractional = BigInt((match[2] ?? "").padEnd(STELLAR_DECIMAL_PLACES, "0"));
  return whole * STROOPS_PER_UNIT + fractional;
}

export function normalizeStellarAsset(value: string) {
  const normalized = value.trim();
  if (/^(native|xlm)$/i.test(normalized)) return "native";

  const separator = normalized.indexOf(":");
  if (separator <= 0 || separator === normalized.length - 1) return undefined;
  if (normalized.indexOf(":", separator + 1) !== -1) return undefined;

  return `${normalized.slice(0, separator).toUpperCase()}:${normalizeAddress(
    normalized.slice(separator + 1),
  )}`;
}

export function paymentMatchesIntent(
  payment: VerifiedPayment,
  expectation: PaymentVerificationExpectation,
) {
  const expectedAmount = amountInStroops(expectation.amount);
  const observedAmount = amountInStroops(payment.amount);
  const expectedAsset = normalizeStellarAsset(expectation.asset);
  const observedAsset = normalizeStellarAsset(payment.asset);

  return (
    expectedAmount !== undefined &&
    observedAmount !== undefined &&
    expectedAmount === observedAmount &&
    expectedAsset !== undefined &&
    observedAsset === expectedAsset &&
    expectation.receiverAddress !== undefined &&
    normalizeAddress(payment.destination) === normalizeAddress(expectation.receiverAddress) &&
    (expectation.payerAddress === undefined ||
      normalizeAddress(payment.source) === normalizeAddress(expectation.payerAddress))
  );
}

export function findVerifiedPayment(
  operations: DebugOperation[],
  expectation: PaymentVerificationExpectation,
): VerifiedPayment | undefined {
  for (const operation of operations) {
    if (
      operation.type !== "payment" ||
      operation.source === undefined ||
      operation.destination === undefined ||
      operation.amount === undefined ||
      operation.asset === undefined
    ) {
      continue;
    }

    const payment = {
      source: operation.source,
      destination: operation.destination,
      amount: operation.amount,
      asset: operation.asset,
    };
    if (paymentMatchesIntent(payment, expectation)) return payment;
  }

  return undefined;
}
