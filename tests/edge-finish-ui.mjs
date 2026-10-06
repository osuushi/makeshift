import { bodyChamferRoute } from "./ui-body-chamfer.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { edgeChainRoute } from "./ui-edge-chain.mjs";
import { edgeFinishFacesRoute } from "./ui-edge-finish-faces.mjs";
import { edgeFinishGridRoute } from "./ui-edge-finish-grid.mjs";
import { edgeFinishMotionRoute } from "./ui-edge-finish-motion.mjs";
import { edgeFinishPeriodicRoute } from "./ui-edge-finish-periodic.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

const subset = process.argv[2];
if (subset && !["faces", "motion", "grid", "adjacent", "periodic"].includes(subset))
  throw new Error(`Unknown edge-finish route: ${subset}`);
await withUiRuntimes(
  async (page, name) => {
    if (!subset || subset === "faces") await edgeFinishFacesRoute(page, name);
    if (!subset || subset === "periodic") await edgeFinishPeriodicRoute(page, name);
    if (!subset || subset === "motion") await edgeFinishMotionRoute(page, name);
    if (!subset || subset === "grid") await edgeFinishGridRoute(page, name);
    if (!subset || subset === "adjacent") {
      // Preserve the established suites' 850px viewport and its grid step.
      await page.setViewportSize({ width: 1280, height: 850 });
      await edgeChainRoute(page, name);
      await bodyFilletRoute(page, name, name === "electron");
      await bodyChamferRoute(page, name, name === "electron");
    }
  },
  { viewport: { width: 1280, height: 800 }, timeout: 15000 },
);
