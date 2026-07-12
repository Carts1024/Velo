export async function runOpenLoop(count, limit, requestsPerSecond, operation) {
  const results = [];
  const pending = new Set();
  const intervalMs = 1000 / requestsPerSecond;
  const startedAt = performance.now();
  let saturatedArrivals = 0;
  let maxInFlight = 0;
  for (let sample = 0; sample < count; sample += 1) {
    const scheduledAt = startedAt + sample * intervalMs;
    const delay = scheduledAt - performance.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    if (pending.size >= limit) {
      saturatedArrivals += 1;
      await Promise.race(pending);
    }
    const request = Promise.resolve(operation(sample, scheduledAt)).then((result) => {
      results.push(result);
    });
    pending.add(request);
    request.finally(() => pending.delete(request));
    maxInFlight = Math.max(maxInFlight, pending.size);
  }
  await Promise.all(pending);
  return {
    results: results.sort((left, right) => left.sample - right.sample),
    saturatedArrivals,
    maxInFlight,
  };
}
