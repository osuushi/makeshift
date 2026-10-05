import assert from "node:assert/strict";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function roundedPlate(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  // Short chain drags use grid-off precision; the large-body route covers default grid-on sizing.
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  await page.keyboard.press("v");
  await click(page, 10, 10);
  await chooseTool(page, "fillet sketch", "sketch-fillet");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("4");
  await page.keyboard.press("Enter");
  await inspect(page);
  const center = await at(page, 0, 0),
    top = await at(page, 0, 10);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.mouse.click(top.x, top.y);
  const state = await inspect(page);
  assert.equal(state.modelingSelection.length, 1);
  assert.equal(state.modelingSelection[0].kind, "edge");
  return { top, original: state.document };
}
export async function edgeChainRoute(page, name) {
  for (const mode of ["fillet", "chamfer"]) {
    const { top, original } = await roundedPlate(page);
    const label = mode === "fillet" ? "Fillet" : "Chamfer";
    const tool = page.getByRole("button", { name: `${label} edges`, exact: true });
    if (mode === "chamfer") await page.keyboard.press("Shift+F");
    await tool.click();
    let state = await inspect(page);
    assert.equal(state.modelingSelection.length, 3, "Straight/arc/straight tangent chain only");
    const expanded = state.modelingSelection;
    assert.deepEqual(state.document, original);
    assert.equal(state.preview, null, "Opening the tool must not change geometry");
    await page.screenshot({ path: `.cache/sketch-review/${name}-${mode}-chain-selected.png` });
    const field = page.getByRole("textbox", {
      name: `${label} ${mode === "fillet" ? "radius" : "distance"}`,
      exact: true,
    });
    await field.fill("1");
    state = await inspect(page);
    assert.deepEqual(
      state.modelingSelection,
      expanded,
      "Source chain remains highlighted during preview",
    );
    assert.ok(state.preview.bodies[0].volume < original.bodies[0].volume);
    await page.screenshot({ path: `.cache/sketch-review/${name}-${mode}-chain-preview.png` });
    await page.keyboard.press("Escape");
    state = await inspect(page);
    assert.deepEqual(state.document, original);
    assert.deepEqual(state.modelingSelection, expanded);
    // Start dragging directly from a single edge; expansion must not swallow the gesture.
    await page.mouse.click(top.x, top.y);
    assert.equal((await inspect(page)).modelingSelection.length, 1);
    if (mode === "chamfer") await page.keyboard.press("Shift+F");
    const box = await tool.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 18, { steps: 4 });
    await page.mouse.up();
    state = await inspect(page);
    assert.equal(state.modelingSelection.length, 3);
    assert.ok(state.preview);
    assert.ok(Number(await field.inputValue()) > 0, "The direct chain drag has a nonzero size");
    await page.keyboard.press("Enter");
    state = await inspect(page);
    assert.equal(state.interaction, null);
    assert.ok(state.document.bodies[0].volume < original.bodies[0].volume);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
  }
  console.log(
    `${name}: required tangent chains expand on entry, stay highlighted, drag/cancel/accept/Undo passed`,
  );
}
