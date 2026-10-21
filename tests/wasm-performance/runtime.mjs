import { cpus } from "node:os";
import { chromium, webkit } from "playwright";
import { Client } from "../geometry-performance/client.mjs";
import { browserClient } from "./browser.mjs";
import { measureDrag } from "./drag.mjs";
import { compare, measure, summary } from "./measure.mjs";

async function measureCase(client, scenario, repeats, references) {
  const first = await measure(client, scenario);
  const samples = [];
  for (let i = 0; i < repeats; i++) samples.push(await measure(client, scenario));
  const reference = scenario.expected ?? references.get(scenario.name) ?? first.outcome;
  const comparisons = [first, ...samples].map(({ outcome }) => {
    try {
      if (scenario.rejection !== undefined && (outcome.error ?? null) !== scenario.rejection)
        throw new Error(`Unexpected rejection state: ${outcome.error ?? "accepted"}`);
      compare(outcome, reference);
      return { matches: true };
    } catch (error) {
      return { matches: false, reason: error.message };
    }
  });
  references.set(scenario.name, references.get(scenario.name) ?? first.outcome);
  return {
    name: scenario.name,
    first,
    samples,
    comparisons,
    summaryPhase: samples.length ? "warm" : "first",
    summary: summary(samples.length ? samples : [first]),
  };
}

export async function runRuntime(name, options) {
  const { executable, server, report, selected, repeats, references, save, prepared } = options;
  const timeout = Number(process.env.MAKESHIFT_BENCHMARK_TIMEOUT_MS ?? 180_000);
  let browser, client;
  const runtime = { name, cases: [] };
  report.runtimes.push(runtime);
  const create = async () => {
    if (name.startsWith("native-")) {
      runtime.threads = name === "native-auto" ? cpus().length : 1;
      const libraryDirectory = process.env.MAKESHIFT_BENCHMARK_LIBRARY_DIR;
      if (libraryDirectory && process.platform !== "darwin")
        throw new Error("Native library experiment needs macOS");
      return new Client(
        executable,
        runtime.threads,
        timeout,
        libraryDirectory ? { DYLD_LIBRARY_PATH: libraryDirectory } : {},
      );
    }
    browser ??= await { chromium, webkit }[name].launch({ headless: true });
    runtime.version = browser.version();
    const next = await browserClient(browser, server.url, timeout);
    runtime.initialization = next.initialization;
    return next;
  };
  try {
    for (const scenario of selected) {
      try {
        client ??= await create();
        const measured = await measureCase(client, scenario, repeats, references);
        runtime.cases.push(measured);
        console.log(
          `${name} ${scenario.name}: ${measured.summary.median.toFixed(1)} ms; ${
            measured.comparisons.every((c) => c.matches)
              ? (measured.first.outcome.error ?? "geometry agrees")
              : "GEOMETRY DIFFERS"
          }`,
        );
      } catch (error) {
        const initializationFailed = !client;
        runtime.cases.push({ name: scenario.name, failure: error.message, comparisons: [] });
        console.error(`${name} ${scenario.name}: ${error.message}`);
        await client?.close();
        client = null;
        if (initializationFailed) {
          for (const remaining of selected.slice(runtime.cases.length))
            runtime.cases.push({
              name: remaining.name,
              failure: `Runtime initialization failed: ${error.message}`,
              comparisons: [],
            });
          await save();
          break;
        }
      }
      await save();
    }
    await client?.close();
    client = null;
    if (browser && runtime.initialization && process.env.MAKESHIFT_BENCHMARK_DRAG !== "0") {
      runtime.drags = [];
      for (const warm of [false, true]) {
        const drag = await measureDrag(browser, server.url, prepared.fixture, warm);
        runtime.drags.push(drag);
        console.log(
          `${name} ${warm ? "warmed" : "first"} drag: ${drag.visibleUpdatesDuringDrag} updates`,
        );
        await save();
      }
    }
  } finally {
    await client?.close();
    await browser?.close();
  }
}
