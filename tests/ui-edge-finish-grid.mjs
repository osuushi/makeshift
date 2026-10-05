import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { dragSize, finishHistory, pickWorld, sizeInput } from "./ui-edge-finish-fixtures.mjs";
import { assertSurfaceMovement } from "./ui-edge-finish-motion.mjs";
import { at, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function largeGridPlate(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if (!(await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  const status = await page.getByRole("status").textContent();
  const step = Number(status.match(/([\d.]+) mm grid/)[1]);
  assert.ok(step > 0);
  await page.keyboard.press("r");
  await drag(page, [-20, -20], [20, 20]);
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("20");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const original = (await inspect(page)).document;
  assert.ok(Math.abs(original.bodies[0].volume - 32000) < 1e-6);
  await page.keyboard.press("Escape");
  await orient(page, [1, 1, 1]);
  return { original, step };
}

export async function edgeFinishGridRoute(page, name) {
  for (const mode of ["fillet", "chamfer"]) {
    const { original, step } = await largeGridPlate(page);
    const anchor = [20, 20, 10];
    await pickWorld(page, anchor);
    await chooseTool(page, mode, mode);
    const state = await inspect(page);
    assert.equal(state.gridSnap, true);
    const box = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
    const distance = (step * box.height) / state.camera.height + 5;
    const preview = await dragSize(page, mode, distance);
    const size = Number(await sizeInput(page, mode).inputValue());
    assert.ok(
      size >= step && Math.abs(size / step - Math.round(size / step)) < 1e-6,
      "Default grid-on drag produces a snapped nonzero size",
    );
    await assertSurfaceMovement(page, preview, original, anchor, -1, mode);
    await finishHistory(page, mode, original);
  }
  console.log(
    `${name}: default grid-on convex Fillet/Chamfer drag, snapped nonzero size, kernel recession and one Undo/Redo passed`,
  );
}
