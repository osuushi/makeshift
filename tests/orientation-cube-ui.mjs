import { orientationCubeRoute } from "./ui-orientation-cube.mjs";
import { bevelViewsRoute } from "./ui-orientation-cube-bevels.mjs";
import { cubeClicksRoute, cubeTouchRoute, sketchShortcut } from "./ui-orientation-cube-clicks.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await orientationCubeRoute(page, name);
    await bevelViewsRoute(page, name);
    await cubeClicksRoute(page, name);
    await sketchShortcut(page);
    if (name !== "electron") await cubeTouchRoute(page, name);
  },
  { defaults: ["chromium", "webkit"], hasTouch: true, timeout: 15000 },
);
