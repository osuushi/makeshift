import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { inspect } from "./ui-helpers.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

export async function penExtrusionRoute(page, name) {
  const fixture = JSON.parse(await readFile("tests/fixtures/pen-extrusion.json", "utf8"));
  await inspect(page);
  await openDocument(page, {
    name: "pen-outline.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await inspect(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const pick = await project(page, [0, 0, 0]);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("16");
  await page.keyboard.press("Enter");
  let state = await inspect(page);
  assert.ok(state.preview?.bodies.length === 1, state.message);
  assert.equal(state.document.bodies?.length ?? 0, 0);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 1);
  assert.ok(state.document.bodies[0].volume > 4800);
  await page.screenshot({ path: `.cache/sketch-review/${name}-captured-pen-extrusion.png` });
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await page.keyboard.press("Escape");
  const surface = await project(page, [0, 0, 16]);
  await page.mouse.click(surface.x, surface.y);
  await browseTools(page, "Select");
  await chooseTool(page, "select owning bodies", "selection-bodies");
  const original = (await inspect(page)).document.bodies[0];
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("10");
  await page.keyboard.press("Enter");
  const moved = (await inspect(page)).document.bodies[0];
  assert.equal(moved.id, original.id);
  assert.ok(Math.abs(moved.center[0] - original.center[0] - 10) < 1e-8);
  assert.ok(Math.abs(moved.volume - original.volume) < 1e-8);
  await bodyArchiveRoute(page, `${name}-pen-extrusion`);
  console.log(
    `${name}: captured Pen outline, profile pick, 16mm preview/accept, Undo/Redo, reselection/Move and Save/Open passed`,
  );
}
