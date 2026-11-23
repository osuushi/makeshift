// Run each program inside its own QuickJS VM. Only JSON modeling calls cross into the page.
import wasmUrl from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import type { QuickJSDeferredPromise } from "quickjs-emscripten-core";
import type { ScriptApi, ScriptOperation } from "../agent-script/api.js";
import { initializeDecoratorRuntime } from "../decorators/javascript-runtime.js";

async function start(source: string, selection: ScriptApi["selection"]) {
  const module = await initializeDecoratorRuntime(wasmUrl);
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const vm = runtime.newContext();
  let pending: QuickJSDeferredPromise | undefined;
  let failed = false;
  const step = vm.newFunction("step", (request) => {
    if (pending) {
      failed = true;
      throw new Error("Await each modeling operation.");
    }
    const operation = JSON.parse(vm.getString(request)) as ScriptOperation;
    pending = vm.newPromise();
    self.postMessage({ operation });
    return pending.handle.dup();
  });
  vm.setProp(vm.global, "step", step);
  step.dispose();
  const program = vm.unwrapResult(
    vm.evalCode(
      `
    const makeshift = new Proxy({selection: ${JSON.stringify(selection)}}, {
      get(target, key) {
        if (key === "selection") return target.selection;
        return async (input = {}) => JSON.parse(await step(JSON.stringify({kind: key, input})));
      }
    });
    (async () => {\n${source}\n})().then(value => JSON.stringify(value ?? null))
  `,
      "agent.js",
      { type: "global" },
    ),
  );
  function advance() {
    vm.unwrapResult(runtime.executePendingJobs());
    const state = vm.getPromiseState(program);
    if (state.type === "pending") {
      if (!pending) throw new Error("The script is waiting without a modeling operation.");
      return;
    }
    const value = vm.unwrapResult(state);
    if (pending || failed) throw new Error("Script ended with a parallel or unawaited operation.");
    self.postMessage({ result: JSON.parse(vm.getString(value)) });
    value.dispose();
  }
  self.onmessage = ({ data }) => {
    try {
      if (!pending) throw new Error("Unexpected modeling reply.");
      const value = vm.newString(JSON.stringify(data.result ?? null));
      pending.resolve(value);
      value.dispose();
      pending.dispose();
      pending = undefined;
      advance();
    } catch (error) {
      report(error);
    }
  };
  advance();
}

function report(error: unknown) {
  self.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
self.onmessage = ({ data }) => void start(data.source, data.selection).catch(report);
