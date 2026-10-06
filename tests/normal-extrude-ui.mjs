import { extrudeRoute } from "./ui-extrude.mjs";
import { normalExtrudeRoute } from "./ui-normal-extrude.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await normalExtrudeRoute(page, name);
    await extrudeRoute(page, name);
  },
  { timeout: 30000 },
);
