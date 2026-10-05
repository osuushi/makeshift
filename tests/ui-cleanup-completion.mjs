import assert from "node:assert/strict";
import { cleanBodySeparately, standaloneOnly, undoToDocument } from "./ui-cleanup-controls.mjs";
import { at, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function cleanupCompletionRoute(page, plate) {
  await plate(page);
  const input = page.getByRole("textbox", { name: "Fillet radius", exact: true });
  await input.fill("1");
  const before = await inspect(page);
  await standaloneOnly(page);
  assert.deepEqual(
    (await inspect(page)).preview,
    before.preview,
    "UI availability leaves candidate untouched",
  );
  for (const size of ["1.1", "1.2", "1.3"]) await input.fill(size);
  await inspect(page);
  await standaloneOnly(page);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before.document);
  for (const mode of ["fillet", "chamfer"]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("l");
    const points = [
      [-10, -10],
      [0, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
      [-10, -10],
    ];
    for (let i = 1; i < points.length; i++) await drag(page, points[i - 1], points[i]);
    const center = await at(page, 0, 0),
      edge = await at(page, -5, -10);
    await chooseTool(page, "return to modeling", "modeling");
    await page.mouse.click(center.x, center.y);
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Enter");
    await modalCompleted(page);
    const original = (await inspect(page)).document;
    await page.mouse.click(edge.x, edge.y);
    if (mode === "chamfer") await page.keyboard.press("Shift+F");
    await page
      .getByRole("textbox", { name: mode === "fillet" ? "Fillet radius" : "Chamfer distance" })
      .fill("1");
    const preview = (await inspect(page)).preview;
    await standaloneOnly(page);
    await page.getByRole("button", { name: `Accept ${mode}`, exact: true }).click();
    await modalCompleted(page);
    const accepted = (await inspect(page)).document;
    assert.deepEqual(accepted, preview, "Ordinary completion preserves subdivisions");
    await cleanBodySeparately(page, accepted);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, accepted);
    await undoToDocument(page, original);
    assert.deepEqual((await inspect(page)).document, original);
  }
}
