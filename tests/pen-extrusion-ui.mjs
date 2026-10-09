import { penExtrusionRoute } from "./ui-pen-extrusion.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes((page, name) => penExtrusionRoute(page, `${name}-captured`), {
  allowed: ["chromium", "webkit", "electron"],
  defaults: ["chromium", "webkit"],
  timeout: 30000,
});
