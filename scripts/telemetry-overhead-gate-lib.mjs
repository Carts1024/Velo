export function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("samples_required");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)];
}

export function evaluateTelemetryOverhead(captures, options = {}) {
  const minimumPairs = options.minimumPairs ?? 3;
  const minimumSuccesses = options.minimumSuccesses ?? 1_000;
  const maximumRatio = options.maximumRatio ?? 0.03;
  const profiles = options.profiles ?? ["normal", "warm"];
  if (!Array.isArray(captures) || captures.length < minimumPairs * 2 * profiles.length) {
    return { pass: false, reason: "insufficient_pairs" };
  }
  const results = {};
  for (const profile of profiles) {
    const profileCaptures = captures.filter((capture) => capture.profile === profile);
    if (profileCaptures.length < minimumPairs * 2)
      return { pass: false, reason: "insufficient_pairs", profile };
    for (let index = 0; index < minimumPairs * 2; index += 2) {
      const disabledCapture = profileCaptures[index];
      const enabledCapture = profileCaptures[index + 1];
      if (disabledCapture?.mode !== "disabled" || enabledCapture?.mode !== "enabled") {
        return { pass: false, reason: "not_alternating", profile };
      }
      for (const field of ["revision", "cohort", "payloadHash"]) {
        if (!disabledCapture[field] || disabledCapture[field] !== enabledCapture[field]) {
          return { pass: false, reason: "metadata_mismatch", profile, field };
        }
      }
    }
    const disabled = profileCaptures
      .filter((capture) => capture.mode === "disabled")
      .flatMap((capture) => capture.successfulDurationsMs ?? []);
    const enabled = profileCaptures
      .filter((capture) => capture.mode === "enabled")
      .flatMap((capture) => capture.successfulDurationsMs ?? []);
    if (disabled.length < minimumSuccesses || enabled.length < minimumSuccesses) {
      return {
        pass: false,
        reason: "insufficient_successes",
        profile,
        disabled: disabled.length,
        enabled: enabled.length,
      };
    }
    const disabledP95 = percentile(disabled, 0.95);
    const enabledP95 = percentile(enabled, 0.95);
    const overheadRatio = (enabledP95 - disabledP95) / disabledP95;
    results[profile] = { disabledP95, enabledP95, overheadRatio };
    if (!(overheadRatio < maximumRatio))
      return { pass: false, reason: "overhead", profile, results };
  }
  return { pass: true, results };
}
