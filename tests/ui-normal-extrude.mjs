import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function acceptDistance(page, value) {
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill(String(value));
  await previewActionReady(page, "Accept extrusion");
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await modalCompleted(page);
}
export async function normalExtrudeRoute(page, name) {
  await steppedCylinder(page);
  const original = (await inspect(page)).document;
  await orient(page, [0, -1, 0.6]);
  await worldClick(page, [0, -10, 15]);
  assert.equal((await inspect(page)).modelingTool, "offset");
  await page.keyboard.press("e");
  assert.equal(
    await page.getByRole("combobox", { name: "Extrusion measurement" }).inputValue(),
    "radius",
  );
  assert.equal(await page.getByRole("textbox", { name: "Draft value" }).isVisible(), false);
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("22");
  await previewActionReady(page, "Accept extrusion");
  let state = await inspect(page);
  assert.deepEqual(state.document, original);
  close(state.preview.bodies[0].volume, Math.PI * (1000 + 4840));
  await page.screenshot({ path: `.cache/sketch-review/${name}-normal-extrude.png` });
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("-1");
  assert.equal(
    await page.getByRole("button", { name: "Accept extrusion", exact: true }).isEnabled(),
    false,
  );
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "extrude", "extrude");
  await acceptDistance(page, 22);
  close((await inspect(page)).document.bodies[0].volume, Math.PI * 5840);
  await worldClick(page, [12, -Math.sqrt(22 ** 2 - 12 ** 2), 15]);
  await page.getByRole("button", { name: "Tools", exact: true }).focus();
  await page.keyboard.press("e");
  assert.equal(await page.getByRole("textbox", { name: "Extrusion distance" }).inputValue(), "22");
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("24");
  await previewActionReady(page, "Accept extrusion");
  await page.keyboard.press("Enter");
  await page.keyboard.press("o");
  await modalCompleted(page);
  close((await inspect(page)).document.bodies[0].volume, Math.PI * 6760);
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await worldClick(page, [0, -10, 15]);
  await page.keyboard.press("e");
  const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
  const bounds = await handle.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - 30, {
    steps: 5,
  });
  await page.mouse.up();
  state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.ok(state.preview, "Drag release preserves a temporary candidate");
  await page.getByRole("combobox", { name: "Extrusion measurement" }).selectOption("offset");
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("-3");
  await previewActionReady(page, "Accept extrusion");
  close((await inspect(page)).preview.bodies[0].volume, Math.PI * 1490);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  close((await inspect(page)).document.bodies[0].volume, Math.PI * 1490);
  await historyAndArchive(page, name, original);
  console.log(
    `${name}: bounded curved-face extrusion radius/distance, drag, accept/cancel, history, deletion and archive passed`,
  );
}

async function steppedCylinder(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await acceptDistance(page, 10);
  await worldClick(page, [0, 0, 10]);
  await page.keyboard.press("e");
  await acceptDistance(page, 10);
}

async function historyAndArchive(page, name, original) {
  const accepted = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("Delete");
  assert.equal((await inspect(page)).document.bodies.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-normal-extrude`);
  close((await inspect(page)).document.bodies[0].volume, Math.PI * 1490);
}
