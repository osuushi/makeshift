import { edgeChainRoute } from "./ui-edge-chain.mjs";
import { edgeFinishFacesRoute } from "./ui-edge-finish-faces.mjs";
import { extrudeTwistRoute } from "./ui-extrude-twist.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { scaleBodyRoute } from "./ui-scale.mjs";
import {
  blendResizeReachability,
  extrusionReachability,
  solidAxialReachability,
} from "./ui-widget-axial-reachability.mjs";
import { projectedCardReachability } from "./ui-widget-card-reachability.mjs";
import { mixedPlanarReachability, planarReachability } from "./ui-widget-planar-reachability.mjs";
import { planeReachability } from "./ui-widget-plane-reachability.mjs";
import { revolveReachability } from "./ui-widget-revolve-reachability.mjs";
import { sketchPlacementReachability } from "./ui-widget-sketch-placement-reachability.mjs";
import { topologyReachability } from "./ui-widget-topology-reachability.mjs";
import { transformReachability } from "./ui-widget-transform-reachability.mjs";

const subset = process.argv[2];
if (
  subset &&
  ![
    "extrude",
    "axial",
    "blend",
    "transform",
    "body",
    "topology",
    "plane",
    "revolve",
    "planar",
    "cards",
    "adjacent",
  ].includes(subset)
)
  throw new Error(`Unknown reachability route: ${subset}`);
async function timed(page, name, route) {
  const start = performance.now();
  await route(page, name);
  console.log(`${name}: ${route.name} ${(performance.now() - start).toFixed(0)}ms`);
}
await withUiRuntimes(
  async (page, name) => {
    if (!subset || subset === "extrude") await timed(page, name, extrusionReachability);
    if (!subset || subset === "axial") await timed(page, name, solidAxialReachability);
    if (!subset || subset === "blend") await timed(page, name, blendResizeReachability);
    if (!subset || subset === "transform" || subset === "body") {
      await timed(page, name, transformReachability);
    }
    if (!subset || subset === "transform" || subset === "topology")
      await timed(page, name, topologyReachability);
    if (!subset || subset === "plane") {
      await timed(page, name, planeReachability);
      await timed(page, name, sketchPlacementReachability);
    }
    if (!subset || subset === "revolve") await timed(page, name, revolveReachability);
    if (!subset || subset === "planar") {
      await timed(page, name, planarReachability);
      await timed(page, name, mixedPlanarReachability);
    }
    if (!subset || subset === "cards") await timed(page, name, projectedCardReachability);
    if (subset === "adjacent") {
      await timed(page, name, extrudeTwistRoute);
      await revolveRoute(page, name, name === "electron");
      await timed(page, name, scaleBodyRoute);
      // Preserve grid-off ±10 seeds at the established edge-finish viewport:
      // each ordinary reset restores height80, yielding integral10px/unit input.
      await page.setViewportSize({ width: 1280, height: 800 });
      await timed(page, name, edgeFinishFacesRoute);
      await timed(page, name, edgeChainRoute);
    }
  },
  // Full grid-off families use integer10px/world-unit input. Adjacent first3
  // retain850px; exact face/chain seeds switch to their established800px view.
  { viewport: { width: 1280, height: subset === "adjacent" ? 850 : 800 }, timeout: 15000 },
);
