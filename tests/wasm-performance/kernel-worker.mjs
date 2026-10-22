import { candidateBridge } from "./candidate-bridge.mjs";

let candidates;
// The same main/side modules, JSON protocol and allocation path as the web app.
let module;
let phases = [];
self.onmessage = async ({ data }) => {
  try {
    if (data.initialize) {
      const start = performance.now();
      candidates = await candidateBridge(data.assets.candidates);
      const factory = (await import(data.assets.js)).default;
      module = await factory({
        makeshiftSearch: candidates.search,
        locateFile: (name) =>
          name.endsWith("makeshift-kernel.wasm") ? data.assets.side : data.assets.wasm,
        preRun: [
          (runtime) => {
            runtime.ENV.MAKESHIFT_KERNEL_TIMING = "1";
            if (data.assets.candidates)
              runtime.ENV.MAKESHIFT_SWEEP_CANDIDATES = ["invalid-gpu", "unavailable-gpu"].includes(
                data.assets.candidates,
              )
                ? "gpu"
                : data.assets.candidates;
          },
        ],
        printErr: (line) => phases.push(line),
      });
      self.postMessage({
        initialized: true,
        candidates: candidates.info,
        milliseconds: performance.now() - start,
      });
      return;
    }
    phases = [];
    const start = performance.now();
    const pointer = module.stringToNewUTF8(JSON.stringify(data.input));
    let reply;
    try {
      reply = JSON.parse(module.ccall("calculate", "string", ["number"], [pointer]));
    } finally {
      module._free(pointer);
    }
    self.postMessage({
      reply,
      candidates: candidates.stats?.(),
      computeMilliseconds: performance.now() - start,
      phases: phases.join("\n"),
    });
  } catch (error) {
    self.postMessage({ failure: error instanceof Error ? error.message : String(error) });
  }
};
