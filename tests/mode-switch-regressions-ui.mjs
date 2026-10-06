import { modelToolsRoute } from "./ui-model-tools.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { shellRoute } from "./ui-shell.mjs";

await withUiRuntimes(
  async (page, name) => {
    await modelToolsRoute(page, `${name}-model-tools`);
    await shellRoute(page, `${name}-shell`, name === "electron");
  },
  { timeout: 30000 },
);
