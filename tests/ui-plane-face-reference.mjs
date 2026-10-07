import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { planeHover } from "./ui-plane-hover.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function box(page, from, to, depth) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, from, to);
  const center = await at(page, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill(String(depth));
  await settled(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
}
export async function planeFaceReferenceRoute(page, name) {
  await reset(page);
  await box(page, [-10, -10], [10, 10], 20);
  await box(page, [24, -4], [32, 4], 10);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [3, -10, 10]);
  const before = (await inspect(page)).document;
  await chooseTool(page, "imprint", "imprint");
  await page.getByRole("status").filter({ hasText: "Pick a plane grid" }).waitFor();
  // Adaptive XZ now crosses the cap center; pick on the exposed front half.
  await planeHover(page, [28, -2, 10], `${name}-face`);
  await worldClick(page, [28, -2, 10]);
  const preview = (await inspect(page)).preview;
  assert.ok(preview);
  assert.match(
    await page.locator(".plane-cut-inputs").textContent(),
    /Cutter · Body 2 · planar face/,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Select Body 2", exact: true })
      .evaluate((button) => button.closest(".entity-row").dataset.booleanRole),
    "tool",
  );
  assert.equal(preview.bodies[0].faces.length, before.bodies[0].faces.length + 1);
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies[0].faces.length, 7);
  await chooseTool(page, "undo", "undo");
  await worldClick(page, [3, -10, 10]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await chooseTool(page, "split body", "split");
  await page.getByRole("status").filter({ hasText: "Pick a plane grid" }).waitFor();
  await worldClick(page, [28, -2, 10]);
  assert.equal((await inspect(page)).preview.bodies.length, 3);
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  const after = await inspect(page);
  assert.equal(after.document.bodies.length, 3, "Selecting another entity accepts Split");
  assert.equal(after.modelingSelection.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(name, "planar-face references and entity-switch acceptance passed");
}
