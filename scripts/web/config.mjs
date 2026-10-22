import { resolve } from "node:path";

/** Keep incompatible exception runtimes in separate SDK/build directories. */
export function webBuildConfig() {
  const exceptions = process.env.MAKESHIFT_WEB_EXCEPTIONS ?? "wasm";
  if (!["javascript", "wasm"].includes(exceptions))
    throw new Error("MAKESHIFT_WEB_EXCEPTIONS must be javascript or wasm");
  const variant = exceptions === "wasm" ? "web-wasm-exceptions" : "web";
  return {
    exceptions,
    cache: resolve(`.cache/${variant}`),
    buildPrefix: resolve(`.build/${variant}`),
    flag:
      exceptions === "wasm"
        ? "-fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0 -UOCC_CONVERT_SIGNALS"
        : "-fexceptions -UOCC_CONVERT_SIGNALS",
  };
}
