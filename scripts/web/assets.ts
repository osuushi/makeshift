import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { webBuildConfig } from "./config.mjs";

/** Stable content URLs let unchanged calculators survive application releases in HTTP caches. */
export function wasmAssets(): Plugin {
  const assets: Record<string, { js: string; wasm: string; side?: string }> = {};
  return {
    name: "makeshift-wasm-assets",
    buildStart() {
      const emit = (kind: string, name: string, extension: "js" | "wasm") => {
        const source = readFileSync(
          resolve(`${webBuildConfig().buildPrefix}-${kind}/bin/makeshift-${name}.${extension}`),
        );
        const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
        const filename = `makeshift-${name}-${hash}.${extension}`;
        this.emitFile({ type: "asset", fileName: `assets/${filename}`, source });
        return `./${filename}`;
      };
      assets.solver = {
        js: emit("solver", "solver", "js"),
        wasm: emit("solver", "solver", "wasm"),
      };
      assets.kernel = {
        js: emit("kernel", "occt", "js"),
        wasm: emit("kernel", "occt", "wasm"),
        side: emit("kernel", "kernel", "wasm"),
      };
      this.emitFile({
        type: "asset",
        fileName: "calculator-build.json",
        source: JSON.stringify({ exceptions: webBuildConfig().exceptions }),
      });
    },
    resolveId(id) {
      if (id === "virtual:wasm-assets") return "\0virtual:wasm-assets";
    },
    load(id) {
      if (id === "\0virtual:wasm-assets") return `export default ${JSON.stringify(assets)}`;
    },
  };
}
