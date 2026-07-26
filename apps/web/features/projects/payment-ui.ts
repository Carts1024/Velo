export type PaymentStatus =
  | "awaiting_route"
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled";

export type PaymentStageTimestamps = {
  created: number;
  routeReady?: number;
  routeFailed?: number;
  awaiting_signature?: number;
  signed?: number;
  submitted?: number;
  submissionReported?: number;
  observed?: number;
  confirmed?: number;
  failed?: number;
  cancelled?: number;
  expired?: number;
};

export function effectivePaymentStatus(
  intent: { status: PaymentStatus; expiresAt: number },
  now = Date.now(),
): PaymentStatus {
  return (intent.status === "created" || intent.status === "awaiting_route") &&
    intent.expiresAt <= now
    ? "expired"
    : intent.status;
}

export function formatPaymentAsset(asset: string) {
  if (asset === "native" || asset === "XLM") return "XLM";
  return asset.split(":")[0] || asset;
}

export function formatPaymentAmount(amount: string, asset: string) {
  const value = Number(amount);
  const formatted = Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 7 }).format(value)
    : amount;
  return `${formatted} ${formatPaymentAsset(asset)}`;
}

export function validatePaymentAmount(value: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
    return "Enter a valid decimal amount.";
  }
  return Number(normalized) > 0 ? null : "Enter an amount greater than zero.";
}

const lifecycleStages: Array<{
  key: keyof PaymentStageTimestamps;
  label: string;
}> = [
  { key: "created", label: "Created" },
  { key: "routeReady", label: "Route ready" },
  { key: "routeFailed", label: "Route failed" },
  { key: "awaiting_signature", label: "Awaiting signature" },
  { key: "signed", label: "Signed" },
  { key: "submitted", label: "Submitted" },
  { key: "submissionReported", label: "Submission reported" },
  { key: "observed", label: "Observed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "expired", label: "Expired" },
];

export function paymentLifecycle(intent: {
  status: PaymentStatus;
  createdAt: number;
  updatedAt: number;
  stageTimestamps?: PaymentStageTimestamps;
}) {
  const timestamps = intent.stageTimestamps ?? { created: intent.createdAt };
  const terminalKey =
    intent.status === "paid"
      ? "confirmed"
      : intent.status === "failed" || intent.status === "cancelled" || intent.status === "expired"
        ? intent.status
        : null;
  const withFallback =
    terminalKey && timestamps[terminalKey] === undefined
      ? { ...timestamps, [terminalKey]: intent.updatedAt }
      : timestamps;

  return lifecycleStages.flatMap(({ key, label }) => {
    const timestamp = withFallback[key];
    return timestamp === undefined ? [] : [{ key, label, timestamp }];
  });
}
