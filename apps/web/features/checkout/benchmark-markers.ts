export type CheckoutBenchmarkMarkerName =
  | "velo:checkout-start"
  | "velo:checkout-ready"
  | "velo:payment-submitted-rendered"
  | "velo:payment-verified-rendered";

export type CheckoutBenchmarkMarkerDetail = {
  entityId: string;
  state: string;
  version: number;
  epochMs: number;
  monotonicMs: number;
  serverEventAt?: number;
  correlationId?: string;
};

export function createCheckoutBenchmarkMarkerDetail(args: {
  entityId: string;
  state: string;
  version: number;
  serverEventAt?: number;
  correlationId?: string;
  now?: () => number;
  monotonicNow?: () => number;
}): CheckoutBenchmarkMarkerDetail {
  return {
    entityId: args.entityId,
    state: args.state,
    version: args.version,
    epochMs: (args.now ?? Date.now)(),
    monotonicMs: (args.monotonicNow ?? (() => performance.now()))(),
    ...(args.serverEventAt !== undefined ? { serverEventAt: args.serverEventAt } : {}),
    ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
  };
}

export function emitCheckoutBenchmarkMarker(
  enabled: boolean,
  name: CheckoutBenchmarkMarkerName,
  args: Omit<Parameters<typeof createCheckoutBenchmarkMarkerDetail>[0], "now" | "monotonicNow">,
  clocks?: Pick<Parameters<typeof createCheckoutBenchmarkMarkerDetail>[0], "now" | "monotonicNow">,
) {
  if (typeof window === "undefined") return;
  const detail = createCheckoutBenchmarkMarkerDetail({ ...args, ...clocks });
  if (enabled) {
    window.dispatchEvent(new CustomEvent<CheckoutBenchmarkMarkerDetail>(name, { detail }));
  }
  const marker = name.replace(/^velo:/, "").replaceAll("-", "_");
  const durationMs = Math.max(0, detail.epochMs - (detail.serverEventAt ?? detail.epochMs));
  navigator.sendBeacon?.(
    "/api/telemetry/ui",
    new Blob([JSON.stringify({ paymentIntentId: detail.entityId, marker, durationMs })], {
      type: "application/json",
    }),
  );
}
