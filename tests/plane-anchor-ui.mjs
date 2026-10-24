import assert from "node:assert/strict";
import { inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// The shared plane gizmo rendered a disabled anchor: model tests cannot catch
// missing pointer wiring or prove rotation uses the dragged UI anchor.
await withUiRuntimes(async (page) => {
  await reset(page);
  await chooseTool(page, "construction plane", "construction-plane");
  await pickPlane(page, "XY");
  const before = (await inspect(page)).document;
  const anchor = page.getByRole("button", { name: "Reposition plane pivot", exact: true });
  assert.equal(await anchor.isEnabled(), true);
  const box = await anchor.boundingBox();
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 75, start.y + 45, { steps: 8 });
  await page.mouse.up();
  await modalCompleted(page);
  assert.deepEqual((await inspect(page)).document, before, "Anchor drag is UI state only");
  const moved = await anchor.boundingBox();
  assert.ok(Math.hypot(moved.x - box.x, moved.y - box.y) > 30, "Anchor follows pointer");
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x - 60, start.y - 40, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const cancelled = await anchor.boundingBox();
  assert.ok(Math.hypot(cancelled.x - moved.x, cancelled.y - moved.y) < 1);
  await page.getByRole("button", { name: "Rotate layer", exact: true }).click();
  const rotation = page
    .locator(".body-gizmo:not([hidden]) .body-rotate-handle:not([hidden])")
    .first();
  const axis = await rotation.getAttribute("data-axis");
  await rotation.click();
  await page.getByRole("textbox", { name: `Plane rotation ${axis}`, exact: true }).fill("90");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const after = (await inspect(page)).document;
  assert.ok(
    Math.hypot(...after.constructionPlanes[0].frame.origin) > 1,
    "Rotation about the moved anchor relocates the plane origin",
  );
  await page.keyboard.press("Meta+z");
  assert.deepEqual((await inspect(page)).document, before, "One Undo restores plane geometry");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).click();
  const reselected = await anchor.boundingBox();
  assert.ok(
    Math.hypot(reselected.x - box.x, reselected.y - box.y) < 1,
    "Reselection restores the anchor to the plane origin",
  );
  await page.keyboard.press("Meta+z");
  assert.equal(
    (await inspect(page)).document.constructionPlanes?.length ?? 0,
    0,
    "Anchor dragging added no Undo entry",
  );
  console.log("Plane anchor pointer drag, cancellation, rotation and Undo passed");
});
