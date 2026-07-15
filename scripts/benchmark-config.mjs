export function resolveTargetSamples(args, profile) {
  const requested = positiveInt(args.samples ?? "1000", "samples");

  // An explicit CLI value is a deliberate local/canary override. Qualification
  // runs omit --samples and retain the profile's workload floor.
  if (args.samples !== undefined) return requested;

  const durationSamples = Math.ceil(profile.requestsPerSecond * profile.durationSeconds);
  return Math.max(requested, profile.sampleTarget, durationSamples);
}

function positiveInt(value, name) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}
