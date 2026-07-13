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
};

export function createCheckoutBenchmarkMarkerDetail(args: {
  entityId: string;
  state: string;
  version: number;
  serverEventAt?: number;
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
  };
}

export function emitCheckoutBenchmarkMarker(
  enabled: boolean,
  name: CheckoutBenchmarkMarkerName,
  args: Omit<Parameters<typeof createCheckoutBenchmarkMarkerDetail>[0], "now" | "monotonicNow">,
  clocks?: Pick<Parameters<typeof createCheckoutBenchmarkMarkerDetail>[0], "now" | "monotonicNow">,
) {
  if (!enabled || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CheckoutBenchmarkMarkerDetail>(name, {
      detail: createCheckoutBenchmarkMarkerDetail({ ...args, ...clocks }),
    }),
  );
}
