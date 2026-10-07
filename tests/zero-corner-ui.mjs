import { withUiRuntimes } from "./ui-runtime.mjs";
import { zeroCornerRoute } from "./ui-zero-corner.mjs";

await withUiRuntimes(zeroCornerRoute, {
  allowed: ["chromium", "webkit", "electron"],
  defaults: ["chromium", "webkit"],
});
