import { mkdir } from "node:fs/promises";
import { tabletInputRoute } from "./ipad-input.mjs";
import { installPenClassification } from "./ipad-pen.mjs";
import { tabletSolidRoute } from "./ipad-solid.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await mkdir(".cache/ipad", { recursive: true });
await withUiRuntimes(
  async (page, name) => {
    await installPenClassification(page);
    await page.reload();
    await settled(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    await drag(page, [-10, -10], [10, 10]);
    await chooseTool(page, "return to modeling", "modeling");
    await settled(page);
    await tabletInputRoute(page, name);
    await tabletSolidRoute(page, name);
  },
  { allowed: ["chromium", "webkit"], hasTouch: true, viewport: { width: 1024, height: 768 } },
);
