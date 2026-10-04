import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { arcRoute } from "./ui-arc.mjs";
import { bezierRoute } from "./ui-bezier.mjs";
import { bodyChamferRoute } from "./ui-body-chamfer.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { circleRoute } from "./ui-circle.mjs";
import { extrudeRoute } from "./ui-extrude.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { lineRoute } from "./ui-line.mjs";
import { planeCutRoute } from "./ui-plane-cuts.mjs";
import { pointLinkRoute } from "./ui-point-links.mjs";
import { rectangleRoute } from "./ui-rectangle.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { shellRoute } from "./ui-shell.mjs";
import { transformRoute } from "./ui-transform.mjs";
import { trimLineRoute } from "./ui-trim.mjs";

const { values } = parseArgs({
  options: { "mac-webkit-transform": { type: "boolean" }, shard: { type: "string" } },
});
assert.ok(!values.shard || /^[1-3]\/3$/.test(values.shard), "Choose UI shard 1/3–3/3");
const [shard, count] = (values.shard ?? "1/1").split("/").map(Number);

// A bounded ordinary-control gate; captured geometry and async interleavings
// stay in their dedicated suites. All routes use the real native owner path.
await withUiRuntimes(
  async (page, name) => {
    for (const [index, route] of [
      rectangleRoute,
      lineRoute,
      circleRoute,
      arcRoute,
      bezierRoute,
      pointLinkRoute,
      trimLineRoute,
      transformRoute,
      extrudeRoute,
      revolveRoute,
      faceOffsetRoute,
      bodyFilletRoute,
      bodyChamferRoute,
      shellRoute,
      planeCutRoute,
    ].entries()) {
      if (index % count !== shard - 1) continue;
      // The unchanged constrained-rotation assertion runs on Mac WebKit in CI.
      if (values["mac-webkit-transform"] && name === "webkit" && route === transformRoute) continue;
      console.log(`${name}: ${route.name}`);
      await route(page, name, name === "electron");
    }
  },
  { timeout: 30000 },
);
