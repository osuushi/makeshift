import { resolve } from "node:path";
import { defineConfig } from "vite";
import { wasmAssets } from "./scripts/web/assets.js";
import { sketchBackend } from "./src/backend/dev-plugin.js";
import { fixtureCapture } from "./src/backend/fixture-plugin.js";
import { meshBackend } from "./src/backend/mesh-plugin.js";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins:
    mode === "web"
      ? [
          wasmAssets(),
          {
            name: "makeshift-web-entry",
            transformIndexHtml: {
              order: "pre",
              handler(html) {
                return html
                  .replace('src="/entry.ts"', 'src="/web-entry.ts"')
                  .replace(
                    "</head>",
                    '<link rel="manifest" href="./manifest.webmanifest"/><meta name="theme-color" content="#f8f9fb"/></head>',
                  );
              },
            },
          },
        ]
      : [sketchBackend(), fixtureCapture(), meshBackend()],
  resolve: {
    alias:
      mode === "web"
        ? [{ find: /\.\/native-calculator\.js$/, replacement: resolve("src/web/calculator.ts") }]
        : [],
  },
  worker: { format: "es", plugins: () => (mode === "web" ? [wasmAssets()] : []) },
  root: "src/sketch",
  publicDir: "../../assets/public",
  build: {
    outDir: mode === "web" ? "../../.build/web" : "../../.build/renderer",
    emptyOutDir: true,
  },
  server: { host: "127.0.0.1", strictPort: true, port: 5173 },
}));
