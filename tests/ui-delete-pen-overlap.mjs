import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function deletePenOverlapRoute(page, name) {
  const { document } = JSON.parse(await readFile("tests/fixtures/delete-pen-overlap.json", "utf8"));
  await openDocument(page, {
    name: "circle-pen-overlap.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document })),
  });
  await inspect(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "return to modeling", "modeling");
  const before = (await inspect(page)).document;
  assert.deepEqual(before.sketches, document.sketches);
  let p = await project(page, [6, 2, 0]);
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.key, `${document.sketches[0].id}/0`);
  await page.keyboard.press("Backspace");
  let state = await inspect(page);
  assert.notDeepEqual(state.document, before);
  assert.equal(state.document.sketches[0].curves.length, 4);
  const trimmed = state.document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, trimmed);
  p = await project(page, [-8, 0, 0]);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("16");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.ok(state.preview?.bodies.length === 1, state.message);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await bodyArchiveRoute(page, `${name}-deleted-pen-union`);
  console.log(
    `${name}: captured circle/Pen overlap deletion, Undo/Redo, reselection, extrusion and Save/Open passed`,
  );
}
