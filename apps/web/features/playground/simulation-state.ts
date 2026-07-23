export type SimulationSettings = {
  baseFee: string;
  cpuInstructions: number;
};

export type SimulationContext = {
  network: "testnet";
  contractId: string;
  expectedWasmHash: string;
  expectedSpecHash: string;
  sourceAccount: string;
  functionName: string;
  arguments: Record<string, unknown>;
  settings: SimulationSettings;
};

export type SimulationFreshness = "fresh" | "stale" | "expired" | "restore_required";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function createSimulationContextKey(context: SimulationContext) {
  return JSON.stringify(stableValue(context));
}

export function simulationFreshness(
  simulation: {
    contextKey: string;
    expiresAt: string;
    status: "success" | "restore_required";
  },
  currentContextKey: string,
  now = Date.now(),
): SimulationFreshness {
  if (simulation.status === "restore_required") return "restore_required";
  if (simulation.contextKey !== currentContextKey) return "stale";
  if (Date.parse(simulation.expiresAt) <= now) return "expired";
  return "fresh";
}
