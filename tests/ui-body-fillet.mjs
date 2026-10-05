import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { cleanupCompletionRoute } from "./ui-cleanup-completion.mjs";
import { standaloneOnly } from "./ui-cleanup-controls.mjs";
import { directionalWidgetRoute } from "./ui-directional-widget.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function plate(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const center = await at(page, 0, 0),
    top = await at(page, 0, 10),
    left = await at(page, -10, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  await inspect(page);
  await page.mouse.click(top.x, top.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(left.x, left.y);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  return { center, top, left };
}
async function radius(page, value) {
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill(String(value));
  await inspect(page);
}
export async function bodyFilletRoute(page, name, electron, cleanup = false) {
  await cleanupCompletionRoute(page, plate);
  await directionalWidgetRoute(page, plate);
  await plate(page);
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  await radius(page, 2);
  let state = await inspect(page);
  assert.equal(state.interaction.kind, "body-edge-finish");
  assert.deepEqual(state.document, original);
  assert.ok(state.preview.bodies[0].volume < original.bodies[0].volume);
  await page.screenshot({ path: `.cache/sketch-review/${name}-fillet-preview.png` });
  await radius(page, 100);
  state = await inspect(page);
  assert.ok(state.preview);
  assert.deepEqual(state.document, original);
  const bounded = Number(await page.getByRole("textbox", { name: "Fillet radius" }).inputValue());
  assert.ok(bounded > 2 && bounded < 100, "Overshoot settles at a legal radius");
  assert.equal(
    await page.getByRole("textbox", { name: "Fillet radius" }).getAttribute("aria-invalid"),
    "false",
  );
  await standaloneOnly(page);
  assert.ok(await page.getByRole("button", { name: "Accept fillet" }).isEnabled());
  await radius(page, 1);
  if (cleanup) {
    await standaloneOnly(page);
    await page.getByRole("button", { name: "Accept fillet", exact: true }).click();
  } else await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  assert.ok(accepted.bodies[0].volume < original.bodies[0].volume);
  assert.equal((await inspect(page)).interaction, null);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-fillet.png` });
  await bodyArchiveRoute(page, `${name}-fillet`, electron);
  // Reload gives the shared modeling camera; enter a surviving planar face.
  // Use the top view via the original sketch's plane, then return to modeling.
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const center = await at(page, 6, -6);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).activePlane);
  await page.keyboard.press("l");
  await drag(page, [-3, 0], [3, 0]);
  assert.equal((await inspect(page)).document.sketches.length, 2);
  await dragCancelAndAccept(page, name);
  await circularFinish(page, name);
  console.log(
    `${name}: shared edge fillet, legal limits, drag/cancel/selection acceptance, history, archive and surviving-face sketch passed`,
  );
}

async function dragCancelAndAccept(page, name) {
  const points = await plate(page),
    original = (await inspect(page)).document;
  const handle = page.getByRole("button", { name: "Fillet edges", exact: true });
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  let state = await inspect(page);
  assert.ok(state.preview);
  assert.deepEqual(state.document, original, "Drag release does not accept");
  await page.keyboard.press("Escape");
  state = await inspect(page);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, original);
  await handle.click();
  await radius(page, 2);
  // Camera events over the active widget must still work.
  const before = (await inspect(page)).camera;
  await page.mouse.wheel(0, 15);
  assert.notDeepEqual((await inspect(page)).camera.position, before.position);
  await page.mouse.wheel(0, -15);
  await previewActionReady(page, "Accept fillet");
  await page.mouse.click(points.center.x, points.center.y);
  await modalCompleted(page);
  assert.equal((await inspect(page)).interaction, null);
  assert.ok((await inspect(page)).document.bodies[0].volume < original.bodies[0].volume);
  await page.screenshot({ path: `.cache/sketch-review/${name}-shared-edge-fillet.png` });
}

export async function circularFinish(page, name, mode = "fillet") {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  const center = await at(page, 0, 0),
    rim = await at(page, 8, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.bodies[0].volume, 640 * Math.PI);
  await page.mouse.click(rim.x, rim.y);
  const nameLabel = mode === "fillet" ? "Fillet" : "Chamfer";
  if (mode === "chamfer") await page.keyboard.press("Shift+F");
  // Reproject a curved-edge idle widget through ordinary camera gestures before editing.
  await orient(page, [0.5, 0.5, 1]);
  await page.getByRole("button", { name: `${nameLabel} edges`, exact: true }).click();
  await page
    .getByRole("textbox", { name: `${nameLabel} ${mode === "fillet" ? "radius" : "distance"}` })
    .fill("2");
  await inspect(page);
  assert.equal((await inspect(page)).preview.bodies[0].faces.length, 4);
  await previewActionReady(page, `Accept ${mode}`);
  await page.getByRole("button", { name: `Accept ${mode}`, exact: true }).click();
  await modalCompleted(page);
  await orient(page, [0.5, 0.5, 1]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-circular-${mode}.png` });
}
