import { bezierRoute, cubicTangentCouplingRoute } from "./ui-bezier.mjs";
import { penRoute } from "./ui-pen.mjs";
import { penExtrusionRoute } from "./ui-pen-extrusion.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await penRoute(page, name);
    await penExtrusionRoute(page, name);
    await bezierRoute(page, name);
    await cubicTangentCouplingRoute(page, name);
  },
  { allowed: ["chromium", "webkit", "electron"], defaults: ["chromium", "webkit"], timeout: 30000 },
);
