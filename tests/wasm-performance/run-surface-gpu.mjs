import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { serve } from "./browser.mjs";

const shape = process.argv[2];
const directory = resolve(process.argv[3] ?? ".cache/wasm-performance/gpu");
if (!shape) throw new Error("run-surface-gpu.mjs INPUT.brep [OUTPUT_DIRECTORY]");
await mkdir(directory, { recursive: true });
const counts = [1024, 16384, 262144];
const precise = process.env.MAKESHIFT_GPU_PRECISION === "double-single";
const shaderPath = `tests/wasm-performance/surface-batch${precise ? "-precise" : ""}.wgsl`;
const sha256 = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const report = {
  capturedAt: new Date().toISOString(),
  precision: precise ? "double-single" : "f32",
  host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, threads: cpus().length },
  shape,
  shapeHash: await sha256(shape),
  exporterHash: await sha256(".build/benchmarks/export-surface-batch"),
  shaderHash: await sha256(shaderPath),
  native: [],
  browsers: [],
};
for (const count of counts) {
  const prefix = `${directory}/${count}`;
  const result = execFileSync(
    resolve(".build/benchmarks/export-surface-batch"),
    [shape, prefix, String(count)],
    { encoding: "utf8" },
  );
  report.native.push(JSON.parse(result));
}
const patches = JSON.parse(await readFile(`${directory}/${counts.at(-1)}.patches.json`, "utf8"));
const shader = await readFile(shaderPath, "utf8");
const server = await serve();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({
      headless: true,
      ...(name === "chromium"
        ? { channel: "chromium", args: ["--enable-webgpu-developer-features"] }
        : {}),
    });
    try {
      let hardware;
      if (name === "chromium") {
        const session = await browser.newBrowserCDPSession();
        hardware = (await session.send("SystemInfo.getInfo")).gpu;
        await session.detach();
      }
      const page = await browser.newPage();
      await page.goto(`${server.url}benchmark/`);
      const result = await page.evaluate(
        async (input) => {
          const { surfaceGpu } = await import("/benchmark/surface-gpu.mjs");
          return surfaceGpu(input);
        },
        { patches, shader, counts, precise },
      );
      for (const measurement of result.results ?? []) {
        const bytes = await readFile(`${directory}/${measurement.count}.reference.f64`);
        measurement.errors = assess(
          measurement.values,
          new Float64Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 8),
          patches,
          precise,
        );
        delete measurement.values;
        measurement.medianMs = [...measurement.milliseconds].sort((a, b) => a - b)[2];
      }
      report.browsers.push({ name, version: browser.version(), hardware, ...result });
      console.log(JSON.stringify(report.browsers.at(-1), null, 2));
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  await writeFile(`${directory}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
}

function assess(actual, reference, patches, precise) {
  let maxPositionMm = 0,
    maxDerivative = 0,
    outside1e7 = 0,
    outside1e3 = 0,
    nonfinite = 0;
  for (let i = 0; i < reference.length / 9; i++) {
    const origin = patches[i % patches.length].poles[0];
    const stride = precise ? 8 : 4;
    const component = (part, axis) => {
      const offset = i * stride * 3 + part * stride + axis;
      return actual[offset] + (precise ? actual[offset + 4] : 0);
    };
    const point = Math.hypot(
      ...[0, 1, 2].map((axis) => component(0, axis) + origin[axis] - reference[i * 9 + axis]),
    );
    const derivative = Math.max(
      ...[0, 1].map((direction) =>
        Math.hypot(
          ...[0, 1, 2].map(
            (axis) => component(direction + 1, axis) - reference[i * 9 + 3 + direction * 3 + axis],
          ),
        ),
      ),
    );
    if (!Number.isFinite(point) || !Number.isFinite(derivative)) nonfinite++;
    maxPositionMm = Math.max(maxPositionMm, point);
    maxDerivative = Math.max(maxDerivative, derivative);
    if (point > 1e-7) outside1e7++;
    if (point > 1e-3) outside1e3++;
  }
  return { maxPositionMm, maxDerivative, outside1e7, outside1e3, nonfinite };
}
