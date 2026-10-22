export async function candidateBridge(mode) {
  if (mode !== "gpu" && mode !== "invalid-gpu") return { info: { mode: mode ?? "default" } };
  const worker = new Worker("/benchmark/candidate-worker.mjs", { type: "module" });
  const info = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ ready: false, reason: "GPU initialization timeout" });
    }, 15_000);
    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      resolve(data);
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      resolve({ ready: false, reason: event.message });
    };
    worker.postMessage({ initialize: true });
  });
  let calls = 0,
    completed = 0,
    milliseconds = 0;
  const search = (heap, integers, samples, count, points, queries, result) => {
    if (!info.ready) return false;
    const start = performance.now();
    calls++;
    const shared = new SharedArrayBuffer(4 + queries * 4);
    const status = new Int32Array(shared, 0, 1);
    worker.postMessage({
      samples: heap.slice(samples / 4, samples / 4 + count * 4),
      points: heap.slice(points / 4, points / 4 + queries * 4),
      shared,
    });
    const wait = Atomics.wait(status, 0, 0, 30_000);
    milliseconds += performance.now() - start;
    if (wait === "timed-out") {
      worker.terminate();
      info.ready = false;
      return false;
    }
    if (Atomics.load(status, 0) !== 1) return false;
    completed++;
    if (mode === "invalid-gpu") integers.fill(2147483647, result / 4, result / 4 + queries);
    else integers.set(new Int32Array(shared, 4), result / 4);
    return true;
  };
  return { info: { mode, ...info }, search, stats: () => ({ calls, completed, milliseconds }) };
}
