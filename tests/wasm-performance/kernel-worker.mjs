// The same main/side modules, JSON protocol and allocation path as the web app.
let module;
let phases = [];
self.onmessage = async ({ data }) => {
  try {
    if (data.initialize) {
      const start = performance.now();
      const factory = (await import(data.assets.js)).default;
      module = await factory({
        locateFile: (name) =>
          name.endsWith("makeshift-kernel.wasm") ? data.assets.side : data.assets.wasm,
        preRun: [
          (runtime) => {
            runtime.ENV.MAKESHIFT_KERNEL_TIMING = "1";
          },
        ],
        printErr: (line) => phases.push(line),
      });
      self.postMessage({ initialized: true, milliseconds: performance.now() - start });
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
      computeMilliseconds: performance.now() - start,
      phases: phases.join("\n"),
    });
  } catch (error) {
    self.postMessage({ failure: error instanceof Error ? error.message : String(error) });
  }
};
