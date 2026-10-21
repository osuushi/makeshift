import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

export const webRoot = process.env.MAKESHIFT_BENCHMARK_WEB ?? ".build/web";

export async function serve(root = webRoot) {
  const directory = resolve(root);
  const scripts = resolve("tests/wasm-performance");
  const types = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
    ".html": "text/html",
    ".css": "text/css",
  };
  const server = createServer(async (request, response) => {
    try {
      if (process.env.MAKESHIFT_BENCHMARK_CANDIDATES) {
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      }
      const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (path === "/benchmark/") {
        response.setHeader("Content-Type", "text/html");
        response.end("<!doctype html><title>Kernel benchmark</title>");
        return;
      }
      const base = path.startsWith("/benchmark/") ? scripts : directory;
      const file = resolve(
        base,
        path.replace(/^\/benchmark\//, "").replace(/^\//, "") || "index.html",
      );
      if (!file.startsWith(base + sep)) throw new Error("Outside served directory");
      response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () =>
      new Promise((accept, reject) => server.close((error) => (error ? reject(error) : accept()))),
  };
}

export async function browserClient(browser, url, timeout = 180_000) {
  const page = await browser.newPage();
  try {
    await page.goto(`${url}benchmark/`);
    const files = await readdir(resolve(webRoot, "assets"));
    const asset = (pattern) => {
      const matches = files.filter((file) => pattern.test(file));
      if (matches.length !== 1) throw new Error(`Expected one asset for ${pattern}`);
      return new URL(`assets/${matches[0]}`, url).href;
    };
    const initialization = await page.evaluate(
      async (assets) => {
        const worker = new Worker("/benchmark/kernel-worker.mjs", { type: "module" });
        window.kernelBenchmarkTerminate = () => worker.terminate();
        window.kernelBenchmarkRequest = (data) =>
          new Promise((accept, reject) => {
            const start = performance.now();
            const timer = setTimeout(() => {
              worker.terminate();
              reject(new Error("Kernel benchmark timeout"));
            }, assets.timeout);
            worker.onerror = (event) => {
              clearTimeout(timer);
              reject(new Error(event.message));
            };
            worker.onmessage = ({ data: result }) => {
              clearTimeout(timer);
              if (result.failure) reject(new Error(result.failure));
              else accept({ ...result, milliseconds: performance.now() - start });
            };
            worker.postMessage(data);
          });
        return window.kernelBenchmarkRequest({ initialize: true, assets });
      },
      {
        timeout,
        candidates: process.env.MAKESHIFT_BENCHMARK_CANDIDATES,
        js: asset(/^makeshift-occt-.*\.js$/),
        wasm: asset(/^makeshift-occt-.*\.wasm$/),
        side: asset(/^makeshift-kernel-.*\.wasm$/),
      },
    );
    return {
      initialization,
      request: (input) =>
        page.evaluate((value) => window.kernelBenchmarkRequest({ input: value }), input),
      terminate: () => page.evaluate(() => window.kernelBenchmarkTerminate()),
      close: () => page.close(),
    };
  } catch (error) {
    await page.close();
    throw error;
  }
}
