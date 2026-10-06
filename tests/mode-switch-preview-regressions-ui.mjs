import { filletRoute } from "./ui-fillet.mjs";
import { filletGuideRoute } from "./ui-fillet-guide.mjs";
import { offsetRoute } from "./ui-offset.mjs";
import { projectionRoute } from "./ui-projection.mjs";
import { rectangleRoute } from "./ui-rectangle.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await filletGuideRoute(page, `${name}-fillet-guide`);
    await filletRoute(page, `${name}-fillet`);
    await offsetRoute(page, `${name}-offset`);
    const viewport = page.viewportSize();
    try {
      await page.setViewportSize({ width: 1280, height: 2000 });
      await projectionRoute(page, `${name}-projection`);
    } finally {
      await page.setViewportSize(viewport);
    }
    await rectangleRoute(page, `${name}-rectangle`);
  },
  // Fillet/Offset retain their original launcher calibration; Projection sets its own.
  { viewport: { width: 1280, height: 850 }, timeout: 30000 },
);
