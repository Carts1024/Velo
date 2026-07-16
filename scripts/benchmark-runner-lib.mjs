export async function runOpenLoop(count, limit, requestsPerSecond, operation, options = {}) {
  const results = [];
  const pending = new Set();
  const intervalMs = 1000 / requestsPerSecond;
  const startedAt = performance.now();
  let arrivalsEndedAt = startedAt;
  let saturatedArrivals = 0;
  let maxInFlight = 0;
  for (let sample = 0; sample < count; sample += 1) {
    const scheduledAt = startedAt + sample * intervalMs;
    const delay = scheduledAt - performance.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    arrivalsEndedAt = performance.now();
    if (pending.size >= limit) {
      saturatedArrivals += 1;
      results.push(
        options.onDrop?.(sample, scheduledAt) ?? {
          sample,
          scheduledAt,
          status: "dropped",
          evidenceMode: "real",
          lifecycle: [],
          metrics: [],
          errorDetail: { class: "dropped", code: "client_saturation" },
        },
      );
      continue;
    }
    const request = Promise.resolve(operation(sample, scheduledAt)).then((result) => {
      results.push(result);
    });
    pending.add(request);
    request.finally(() => pending.delete(request));
    maxInFlight = Math.max(maxInFlight, pending.size);
  }
  await Promise.all(pending);
  const completedAt = performance.now();
  return {
    results: results.sort((left, right) => left.sample - right.sample),
    saturatedArrivals,
    maxInFlight,
    arrivalDurationMs: Math.max(arrivalsEndedAt - startedAt, 0),
    wallDurationMs: Math.max(completedAt - startedAt, 0),
  };
}
