import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { dragPixels } from "./ui-widget-reachability.mjs";
import { rotateDocked } from "./ui-widget-rotation.mjs";

const handle = (page, label) => page.getByRole("button", { name: label, exact: true });
const field = (page, label) => page.getByRole("textbox", { name: label, exact: true });
async function readyField(page, label) {
  await field(page, label).waitFor({ state: "visible" });
  await page.waitForFunction(
    (label) => document.activeElement?.getAttribute("aria-label") === label,
    label,
  );
  assert.equal(await field(page, label).inputValue(), "0");
}
function sameGeometry(actual, expected) {
  close(actual.volume, expected.volume);
  for (const key of ["bounds", "center"])
    actual[key].forEach((value, i) => {
      close(value, expected[key][i]);
    });
  for (const edge of expected.edges) {
    const points = actual.edges.find((candidate) => candidate.id === edge.id).points;
    for (const offset of [0, edge.points.length - 3]) {
      const point = edge.points.slice(offset, offset + 3);
      assert.ok(
        points.some(
          (_, i) =>
            i % 3 === 0 && point.every((value, j) => Math.abs(value - points[i + j]) < 1e-6),
        ),
        `Accepted edge ${edge.id} retains its transformed endpoint`,
      );
    }
  }
}

await withUiRuntimes(async (page, name) => {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  const pick = await at(page, 3, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await handle(page, "Drag extrusion").click();
  await field(page, "Extrusion distance").fill("8");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await handle(page, "Select Body 1").click();
  await orient(page, [0.5, 0.5, 1]);
  await page.keyboard.press("m");
  const original = (await inspect(page)).document;
  await handle(page, "Rotate body Z").click();
  await field(page, "Body rotation Z").fill("90");
  const rotated = (await inspect(page)).preview.bodies[0];
  await handle(page, "Rotate body X").click();
  await readyField(page, "Body rotation X");
  let state = await inspect(page);
  sameGeometry(state.document.bodies[0], rotated);
  const first = state.document;
  await field(page, "Body rotation X").fill("45");
  const secondPreview = (await inspect(page)).preview.bodies[0];
  await handle(page, "Move body X").click();
  await readyField(page, "Body translation X");
  state = await inspect(page);
  sameGeometry(state.document.bodies[0], secondPreview);
  const second = state.document;
  await field(page, "Body translation X").fill("3");
  await inspect(page);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, second);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, first);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, first);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, second);

  // Real drag/release must retain its rotation until the next physical press.
  await page.keyboard.press("m");
  const body = second.bodies[0];
  const pivot = [0, 1, 2].map((i) => (body.bounds[i] + body.bounds[i + 3]) / 2);
  await rotateDocked(page, handle(page, "Rotate body Z"), pivot, [0, 0, 1], 30);
  state = await inspect(page);
  assert.deepEqual(state.document, second);
  const dragRotation = state.preview.bodies[0];
  await dragPixels(page, handle(page, "Move body X"), { x: 45, y: 0 });
  state = await inspect(page);
  assert.equal(state.preview, null, "The same press starts and accepts the translation drag");
  assert.notDeepEqual(state.document, second);
  await chooseTool(page, "undo", "undo");
  sameGeometry((await inspect(page)).document.bodies[0], dragRotation);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, second);
  console.log(
    `${name}: rotation handle switches, numeric/drag handoff, cancel and separate Undo/Redo passed`,
  );
});
