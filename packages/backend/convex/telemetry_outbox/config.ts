export function isConvexTelemetryEnabled(
  value = process.env.VELO_CONVEX_TELEMETRY_ENABLED,
): boolean {
  return value?.trim().toLowerCase() !== "false";
}
