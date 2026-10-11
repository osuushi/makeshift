import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/shell-cylindrical-splines.json", "utf8"));
async function loadCapture(page) {
  await reset(page);
  // Use ordinary plane controls to look straight into the cavity after shelling.
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await openDocument(page, {
    name: "shell-capture.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.makeshiftInspect().document.bodies?.length === 1);
  await worldClick(page, [-9, -9, 32]);
  const state = await inspect(page);
  assert.equal(state.modelingSelection[0]?.face, fixture.opening);
  return state.document;
}
function expectedVolume(thickness, openings) {
  const { area, perimeter, height } = fixture.section;
  const offset =
    (area + perimeter * thickness + Math.PI * thickness ** 2) *
    (height + (2 - openings) * thickness);
  return Math.abs(offset - area * height);
}
function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-4, `${actual} != ${expected}`);
}
export async function shellCaptureRoute(page, name, electron) {
  const original = await loadCapture(page);
  await page.keyboard.press("s");
  let input = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  for (const thickness of [-1, 1, 4]) {
    await input.fill(String(thickness));
    const state = await inspect(page);
    assert.deepEqual(state.document, original);
    near(state.preview?.bodies[0].volume, expectedVolume(thickness, 1));
  }
  await input.fill("12");
  assert.equal((await inspect(page)).preview, null);
  assert.equal(
    await page.getByRole("button", { name: "Accept shell", exact: true }).isEnabled(),
    false,
  );
  await input.fill("-4");
  near((await inspect(page)).preview?.bodies[0].volume, 26523.2614088);
  await page.screenshot({ path: `.cache/sketch-review/${name}-shell-capture-open.png` });
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-shell-capture`, electron);
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Show Body 1", exact: true }).click();
  await worldClick(page, [-9, -9, 4]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await page.keyboard.press("o");
  await (await relativeOffsetInput(page)).fill("0.2");
  assert.ok((await inspect(page)).preview);
  await page.keyboard.press("Enter");
  assert.notEqual((await inspect(page)).document.bodies[0].volume, accepted.bodies[0].volume);
  await loadCapture(page);
  input = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  await browseTools(page, "Select");
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await page.keyboard.press("s");
  for (const thickness of [-4, 4]) {
    await input.fill(String(thickness));
    near((await inspect(page)).preview?.bodies[0].volume, expectedVolume(thickness, 0));
  }
  await page.keyboard.press("Escape");
  console.log(
    `${name}: captured filleted body shells inward/outward, open/closed; rejection, Undo, Save/Open and re-edit pass`,
  );
}
