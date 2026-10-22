import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serve } from "./browser.mjs";

assert.ok(process.env.MAKESHIFT_BENCHMARK_CANDIDATES);
const server = await serve();
const browser = await chromium.launch({ headless: true, channel: "chromium" });
try {
  const page = await browser.newPage();
  await page.goto(`${server.url}benchmark/`);
  const result = await page.evaluate(async () => {
    const worker = new Worker("/benchmark/candidate-worker.mjs", { type: "module" });
    try {
      const ready = await new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => resolve(data);
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage({ initialize: true });
      });
      if (!ready.ready) throw new Error(ready.reason);
      let seed = 123456;
      const random = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return ((seed >>> 0) % 201) - 100;
      };
      // Integer distances are exactly representable in f32 here, including ties.
      const samples = Float32Array.from({ length: 1001 * 4 }, (_, i) =>
        i % 4 === 3 ? 0 : random(),
      );
      samples.set(samples.subarray(0, 4), 1000 * 4);
      const points = Float32Array.from({ length: 257 * 4 }, (_, i) => (i % 4 === 3 ? 0 : random()));
      points.set(samples.subarray(0, 4), 0);
      const shared = new SharedArrayBuffer(4 + points.length);
      const status = new Int32Array(shared, 0, 1);
      worker.postMessage({ samples, points, shared });
      const deadline = performance.now() + 15_000;
      while (Atomics.load(status, 0) === 0 && performance.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 10));
      if (Atomics.load(status, 0) !== 1) throw new Error("GPU search did not complete");
      const indices = new Int32Array(shared, 4);
      for (let q = 0; q < points.length / 4; q++) {
        let nearest = -1,
          best = Infinity;
        for (let i = 0; i < samples.length / 4; i++) {
          let squared = 0;
          for (let axis = 0; axis < 3; axis++)
            squared += (samples[i * 4 + axis] - points[q * 4 + axis]) ** 2;
          if (squared < best) {
            best = squared;
            nearest = i;
          }
        }
        if (indices[q] !== nearest) throw new Error(`Wrong candidate for query ${q}`);
      }
      return { queries: indices.length, adapter: ready.adapter };
    } finally {
      worker.terminate();
    }
  });
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await server.close();
}
