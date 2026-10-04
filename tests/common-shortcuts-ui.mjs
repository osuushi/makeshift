import { keyTool, shortcutBooleans, shortcutErode } from "./ui-common-shortcuts.mjs";
import { loftRoute } from "./ui-loft.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { shortcutOwnership } from "./ui-shortcut-ownership.mjs";

await withUiRuntimes(
  async (page, name) => {
    const routes = process.argv.slice(2);
    if (!routes.length || routes.includes("ownership")) await shortcutOwnership(page, name);
    if (!routes.length || routes.includes("boolean")) await shortcutBooleans(page, name);
    if (!routes.length || routes.includes("loft"))
      await loftRoute(page, `${name}-shortcuts`, (page) => keyTool(page, "l"));
    if (!routes.length || routes.includes("erode")) await shortcutErode(page, name);
  },
  { timeout: 30000 },
);
