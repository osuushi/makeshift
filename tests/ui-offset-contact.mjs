import assert from "node:assert/strict";
import { orient, outwardDrag, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function step(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  const points = [
    [0, 0],
    [20, 0],
    [20, 10],
    [10, 10],
    [10, 20],
    [0, 20],
  ];
  for (let i = 0; i < points.length; i++)
    await drag(page, points[i], points[(i + 1) % points.length]);
  const p = await at(page, 5, 5);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await orient(page, [1, 1, 0.6]);
  const face = await project(page, [20, 5, 5]);
  await page.mouse.click(face.x, face.y);
  assert.equal((await inspect(page)).modelingSelection[0].kind, "face");
}
export async function offsetContactRoute(page, name, electron) {
  await step(page);
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const input = await relativeOffsetInput(page);
  for (const [value, volume, faces] of [
    [-5, 2500, 8],
    [-10, 2000, 6],
    [-15, 1000, 6],
    [-5, 2500, 8],
  ]) {
    await input.fill(String(value));
    const state = await inspect(page),
      body = state.preview.bodies[0];
    close(body.volume, volume);
    assert.equal(body.faces.length, faces);
    assert.deepEqual(state.document, original);
    const selected = state.modelingSelection;
    assert.equal(selected.length, 1);
    assert.ok(
      body.faces.some((f) => f.id === selected[0].face),
      "Actual merged preview face stays highlighted",
    );
  }
  await input.fill("-30");
  assert.equal((await inspect(page)).preview, null);
  await page.getByRole("button", { name: "Find Nearest", exact: true }).click();
  const limited = (await inspect(page)).preview.bodies[0];
  // Four-significant-figure display can round a legal near-collapse to -20.
  // Verify the actual retained geometry instead of treating its label as exact.
  const bounded = limited.volume / 200 - 20;
  assert.ok(bounded > -20 && bounded <= -15);
  close(limited.bounds[3] - 1e-7, 20 + bounded);
  assert.equal(
    await page
      .getByRole("button", { name: "Offset faces", exact: true })
      .getAttribute("data-geometry-invalid"),
    "true",
  );
  await input.fill("-15");
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-offset-contact.png` });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  const state = await outwardDrag(
    page,
    "Offset faces",
    { offsetHandle: { center: [20, 5, 5], normal: [1, 0, 0] } },
    -16,
  );
  assert.equal(state.preview.bodies[0].faces.length, 6);
  // This view uses a 2 mm grid; use an exact grid multiple for the drag.
  close(state.preview.bodies[0].volume, 800);
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.bodies[0].volume, 800);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await bodyArchiveRoute(page, `${name}-contact`, electron);
  assert.equal((await inspect(page)).document.bodies[0].faces.length, 6);
  console.log(
    `${name}: stepped face contacts/merges/continues, clean topology, highlight, limit/reverse, drag/cancel/Undo/archive passed`,
  );
}
