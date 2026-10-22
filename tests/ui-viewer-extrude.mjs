import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Founder fixture: XZ viewed from +Y/below, opposite its stored -Y normal.
export async function viewerExtrudeRoute(page, name) {
  await openDocument(page, resolve("tests/fixtures/extrude-back-view.makeshift"));
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  // Pick inside the profile, clear of the circle-center guide.
  const center = await project(page, [8, 0, 0]);
  await page.mouse.click(center.x, center.y);
  await page.keyboard.press("e");
  const arrow = page.getByRole("button", { name: "Drag extrusion", exact: true });
  assert.ok(Number(await arrow.getAttribute("data-direction-y")) < -0.9, "Arrow faces screen up");
  const box = await arrow.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 5 });
  await page.mouse.up();
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  assert.ok(Number(await distance.inputValue()) > 0, "Upward drag gives positive viewer distance");
  assert.ok((await preview(page)).center[1] > 0, "Native extrusion goes toward the viewer");
  await distance.fill("-8");
  assert.ok((await preview(page)).center[1] < 0, "Negative distance reverses direction");
  await distance.fill("8");
  const first = await preview(page);
  await orient(page, [0, -1, 1]);
  await distance.fill("12");
  const held = await preview(page);
  assert.ok(Math.abs(held.center[1] - 6) < 1e-6, "Orbit does not flip an active operation");
  assert.ok(first.center[1] > 0);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await modalCompleted(page);
  const accepted = (await inspect(page)).document;
  await chooseTool(page, "reopen last operation", "reopen-operation");
  const restored = await preview(page);
  assert.deepEqual(
    restored.bounds,
    accepted.bodies[0].bounds,
    "Reopen from opposite view preserves geometry",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).inputValue(),
    "-12",
  );
  await page.getByRole("button", { name: "Cancel extrusion", exact: true }).click();
  await modalCompleted(page);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual(
    (await inspect(page)).document,
    accepted,
    "Cancel/Redo restores the accepted result",
  );
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.screenshot({ path: `.cache/sketch-review/${name}-viewer-extrude.png` });
}

async function preview(page) {
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return !state.busy && !!state.preview?.bodies?.length;
  });
  return (await inspect(page)).preview.bodies[0];
}
