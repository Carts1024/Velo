import type { Doc } from "../_generated/dataModel";

type TopupPolicy = Pick<Doc<"billingPolicies">, "billingTopupsEnabled" | "billingKillSwitch">;

type TopupAvailability = { enabled: true; reason: null } | { enabled: false; reason: string };

export function topupAvailability(policy: TopupPolicy | null): TopupAvailability {
  if (!policy) {
    return {
      enabled: false,
      reason: "Platform billing is not configured. Contact a Velo billing operator.",
    };
  }
  if (policy.billingKillSwitch) {
    return {
      enabled: false,
      reason: "Credit purchases are temporarily paused by the platform billing kill switch.",
    };
  }
  if (!policy.billingTopupsEnabled) {
    return {
      enabled: false,
      reason: "Credit purchases have not been enabled by a Velo billing operator.",
    };
  }
  return { enabled: true, reason: null };
}
