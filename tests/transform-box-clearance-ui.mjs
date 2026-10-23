import assert from "node:assert/strict";
import { edgeFinishPrism } from "./ui-edge-finish-fixtures.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { assertOutsideTransformBox } from "./ui-transform-box-clearance.mjs";
import { assertWidgetTargets } from "./ui-widget-reachability.mjs";
import { panTo } from "./ui-widget-wheel.mjs";

// Only rendered bounds can detect viewport correction moving otherwise correct
// world-space widgets back over the box or its resize handles.
await withUiRuntimes(async (page, name) => {
  const before = await edgeFinishPrism(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await assertOutsideTransformBox(page);
  assert.equal(
    await page.locator('.transform-box-handle[data-handle="-1,-1,-1"]').count(),
    0,
    "The far corner of the opaque box has neither a rendered nor a clickable handle",
  );
  const selector =
    ".body-gizmo:not([hidden]) > button:not([hidden]), .scale-widget:not([hidden]) .transform-box-handle:not([hidden])";
  await panTo(page, before.bodies[0].center, { x: 220, y: 425 });
  await assertWidgetTargets(page, selector, "Box clearance beside entity panel");
  await assertOutsideTransformBox(page);
  await panTo(page, before.bodies[0].center, { x: 640, y: 425 });
  const handle = page.locator(".transform-box-handle:visible").last();
  await handle.click();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.4");
  await page.waitForFunction(() => Boolean(window.makeshiftInspect().preview));
  await assertOutsideTransformBox(page);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(
    `${name}: actual body control rectangles clear box, viewport docking and scale preview`,
  );
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  await chooseTool(page, "transform", "transform");
  await assertOutsideTransformBox(page);
  await panTo(page, [0, 0, 0], { x: 220, y: 425 });
  await assertOutsideTransformBox(page);
  await panTo(page, [0, 0, 0], { x: 640, y: 120 });
  await assertOutsideTransformBox(page);
  console.log(`${name}: actual sketch control rectangles clear centered and docked box`);
});
