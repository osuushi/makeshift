import assets from "virtual:wasm-assets";

type Calculator = {
  stringToNewUTF8(value: string): number;
  _free(pointer: number): void;
  ccall(name: string, result: string, types: string[], values: number[]): string;
};
let module: Promise<Calculator> | undefined;
// Emscripten's automatic side-module loader can reject outside its factory
// promise. Report that fatal startup failure so the owner replaces this worker.
self.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  event.preventDefault();
  const error: unknown = event.reason;
  self.postMessage({ error: error instanceof Error ? error.message : String(error) });
});
self.onmessage = async (
  event: MessageEvent<{ calculator: "solver" | "kernel"; input: unknown }>,
) => {
  try {
    const asset = assets[event.data.calculator];
    module ??= (async () => {
      const url = new URL(asset.js, import.meta.url).href;
      const factory = (await import(/* @vite-ignore */ url)).default;
      return factory({
        locateFile: (name: string) =>
          new URL(
            asset.side && name.endsWith("makeshift-kernel.wasm") ? asset.side : asset.wasm,
            import.meta.url,
          ).href,
      });
    })();
    const calculator = await module;
    const pointer = calculator.stringToNewUTF8(JSON.stringify(event.data.input));
    try {
      const result = JSON.parse(calculator.ccall("calculate", "string", ["number"], [pointer]));
      self.postMessage({ result });
    } finally {
      calculator._free(pointer);
    }
  } catch (error) {
    module = undefined;
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
