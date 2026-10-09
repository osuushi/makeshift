import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// One small real input → native geometry → history → file roundtrip.
// Exhaustive solid operations and parameter combinations belong in model tests.
export async function smokeRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("20");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.getByRole("textbox", { name: "Height", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  const sketch = await inspect(page);
  assert.equal(sketch.document.sketches[0].curves.length, 4);
  assert.ok(sketch.solver.count > 0, "Pointer creation uses the native solver");
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const distance = page.getByRole("textbox", { name: "Extrusion distance" });
  if (!(await distance.isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await distance.fill("5");
  await page.keyboard.press("Enter");
  const preview = await inspect(page);
  assert.equal(preview.document.bodies?.length ?? 0, 0);
  close(preview.preview.bodies[0].volume, 1000);
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 1);
  close(accepted.bodies[0].volume, 1000);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.reload();
  assert.deepEqual((await inspect(page)).document, accepted, "Host survives renderer reload");
  const file = resolve(".cache/sketch-review/smoke.makeshift");
  await saveDocument(page, file);
  await reset(page);
  await openDocument(page, file);
  await page.waitForFunction(() => window.makeshiftInspect().document.bodies?.length === 1);
  const reopened = (await inspect(page)).document;
  assert.deepEqual(reopened.sketches, accepted.sketches);
  const identities = (document) =>
    document.bodies.map((body) => ({
      id: body.id,
      faces: body.faces.map((face) => face.id),
      edges: body.edges.map((edge) => edge.id),
    }));
  assert.deepEqual(
    identities(reopened),
    identities(accepted),
    "Save/Open retains topology identity",
  );
  // OCCT deserialization recomputes derived floating-point bounds/signatures.
  // Check independent dimensions and volume rather than bitwise derived geometry.
  const body = reopened.bodies[0];
  close(body.volume, 1000);
  for (const [axis, length] of [20, 10, 5].entries())
    close(body.bounds[axis + 3] - body.bounds[axis], length);
}
