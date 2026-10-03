import { modelingRoute } from "./ui-modeling.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(modelingRoute, {
  defaults: ["chromium", "webkit", "electron"],
  timeout: 15000,
});
