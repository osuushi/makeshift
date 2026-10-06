import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { finishHistory, pickWorld, sizeInput } from "./ui-edge-finish-fixtures.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function openPeriodic(page) {
  const fixture = JSON.parse(readFileSync("tests/fixtures/periodic-face-fillet.json", "utf8"));
  await reset(page);
  await openDocument(page, {
    name: "periodic-face-fillet.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.makeshiftInspect().document.bodies?.length === 1);
  const original = (await inspect(page)).document;
  const body = original.bodies[0],
    face = body.faces.find((f) => f.id === fixture.face);
  const rims = face.edges.filter((id) => face.edges.indexOf(id) === face.edges.lastIndexOf(id));
  assert.equal(face.edges.length, 4, "The captured face contains two seam occurrences");
  assert.equal(rims.length, 2);
  await page.keyboard.press("Escape");
  await orient(page, [0, -0.6, -1]);
  const wall = await project(page, [0, 8, -23]);
  await page.mouse.move(wall.x, wall.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -110);
  await page.keyboard.up("Control");
  await page.waitForFunction(() => window.makeshiftInspect().camera.height < 30);
  return { original, body, face, rims };
}

async function typeFillet(page) {
  const input = sizeInput(page, "fillet");
  await input.click();
  assert.ok(await input.evaluate((element) => document.activeElement === element));
  await input.press("ControlOrMeta+a");
  await page.keyboard.type("0.0001");
  await previewActionReady(page, "Accept fillet");
  assert.ok(
    await input.evaluate((element) => document.activeElement === element),
    "Native reply retains numeric focus",
  );
  return inspect(page);
}

export async function edgeFinishPeriodicRoute(page, name) {
  const { original, body, face, rims } = await openPeriodic(page);
  const selected = await pickWorld(page, [0, 8, -23]);
  assert.equal(selected.modelingSelection[0]?.face, face.id);
  await chooseTool(page, "fillet", "fillet");
  const state = await inspect(page);
  assert.equal(state.interaction?.kind, "body-edge-finish", "Face expansion keeps the tool open");
  assert.deepEqual(
    state.modelingSelection,
    rims.map((edge) => ({ kind: "edge", body: body.id, edge })),
  );
  const preview = await typeFillet(page);
  assert.ok(preview.preview, "Typed size produces a real kernel preview");
  assert.notEqual(preview.preview.bodies[0].volume, body.volume);
  assert.deepEqual(preview.document, original);
  await page.screenshot({ path: `.cache/sketch-review/${name}-fillet-periodic-face.png` });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Escape");
  // Select the same rims manually through ordinary viewport clicks.
  await pickWorld(page, [0, 8, -22]);
  const explicit = await pickWorld(page, [0, 8, -24], true);
  assert.deepEqual(new Set(explicit.modelingSelection.map((target) => target.edge)), new Set(rims));
  await chooseTool(page, "fillet", "fillet");
  assert.equal((await typeFillet(page)).preview.bodies[0].volume, preview.preview.bodies[0].volume);
  await finishHistory(page, "fillet", original);
  await chooseTool(page, "undo", "undo");
  await page.keyboard.press("Escape");
  await pickWorld(page, [0, 8, -23]);
  await chooseTool(page, "chamfer", "chamfer");
  assert.deepEqual((await inspect(page)).modelingSelection, state.modelingSelection);
  const input = sizeInput(page, "chamfer");
  await input.click();
  await input.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  assert.ok(await input.evaluate((element) => document.activeElement === element));
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "delete", "delete");
  assert.equal((await inspect(page)).document.bodies.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await reset(page);
  console.log(
    `${name}: captured periodic face excludes its seam, retains typed focus, matches explicit rims and preserves Cancel/Undo/Redo; Chamfer conversion/focus and Delete/Undo/New also pass`,
  );
}
