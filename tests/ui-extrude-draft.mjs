import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { standaloneOnly } from "./ui-cleanup-controls.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const volume = (length, offset) =>
  (Math.abs(length) * (400 + 20 * (20 + 2 * offset) + (20 + 2 * offset) ** 2)) / 3;
export async function extrudeDraftRoute(page, name, electron) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  const length = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  const draft = page.getByRole("textbox", { name: "Draft value", exact: true });
  const unit = page.getByRole("combobox", { name: "Draft measurement", exact: true });
  await length.fill("10");
  await inspect(page);
  await unit.selectOption("offset");
  await draft.fill("2");
  let state = await inspect(page);
  close(state.preview.bodies[0].volume, volume(10, 2));
  await unit.selectOption("angle");
  assert.equal(
    Number(await draft.inputValue()),
    Number(((Math.atan(0.2) * 180) / Math.PI).toPrecision(4)),
  );
  close((await inspect(page)).preview.bodies[0].volume, volume(10, 2));
  await length.fill("20");
  close((await inspect(page)).preview.bodies[0].volume, volume(20, 4));
  await unit.selectOption("offset");
  close(Number(await draft.inputValue()), 4);
  await length.fill("10");
  close((await inspect(page)).preview.bodies[0].volume, volume(10, 4));
  await length.fill("-10");
  close((await inspect(page)).preview.bodies[0].volume, volume(-10, 4));
  await draft.fill("-2");
  close((await inspect(page)).preview.bodies[0].volume, volume(-10, -2));
  await length.fill("0");
  assert.equal((await inspect(page)).preview, null);
  assert.equal(await unit.isDisabled(), true);
  await length.fill("10");
  await inspect(page);
  await unit.selectOption("angle");
  await draft.fill("90");
  state = await inspect(page);
  assert.equal(state.preview, null);
  assert.equal(
    await page
      .getByRole("button", { name: "Drag extrusion", exact: true })
      .getAttribute("data-geometry-invalid"),
    "true",
  );
  assert.match(await page.getByRole("status").textContent(), /90/);
  await draft.fill("0");
  await inspect(page);
  await unit.selectOption("offset");
  await draft.fill("-11");
  assert.equal((await inspect(page)).preview, null, "Collapsed square must be rejected");
  await draft.fill("2");
  await inspect(page);
  await page.keyboard.press("Enter");
  assert.equal(
    (await inspect(page)).document.bodies?.length ?? 0,
    0,
    "Enter confirms draft text first",
  );
  await orient(page, [1, -1, 0.7]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-extrude-draft.png` });
  await acceptCleanDraft(page);
  close((await inspect(page)).document.bodies[0].volume, volume(10, 2));
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies[0].volume, volume(10, 2));
  await bodyArchiveRoute(page, `${name}-draft`, electron);
  await draftDragCancel(page);
  console.log(
    `${name}: extrusion draft units, length changes, signed draft, invalid recovery, cleanup, Undo/Redo/archive passed`,
  );
}

async function draftDragCancel(page) {
  const original = (await inspect(page)).document;
  await orient(page, [1, -1, 0.7]);
  const top = await project(page, [0, 0, 10]);
  await page.mouse.click(top.x, top.y);
  await page.keyboard.press("e");
  const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
  await handle.click();
  const unit = page.getByRole("combobox", { name: "Draft measurement", exact: true });
  await unit.selectOption("offset");
  await page.getByRole("textbox", { name: "Draft value", exact: true }).fill("1");
  const start = await handle.boundingBox();
  const anchor = await project(page, [0, 0, 10]);
  // The current 2 mm grid makes 5 mm an ambiguous half-step; drag to 6 mm.
  const end = await project(page, [0, 0, 16]);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    start.x + start.width / 2 + end.x - anchor.x,
    start.y + start.height / 2 + end.y - anchor.y,
    { steps: 4 },
  );
  await page.mouse.up();
  const state = await inspect(page);
  assert.equal(state.preview.bodies.length, 1);
  close(state.preview.bodies[0].volume, original.bodies[0].volume + (6 * (576 + 624 + 676)) / 3);
  await unit.focus();
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  assert.equal((await inspect(page)).preview, null);
}

async function acceptCleanDraft(page) {
  await standaloneOnly(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
}
