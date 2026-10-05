import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { at, close, inspect } from "./ui-helpers.mjs";
import { button, completed, cycle, field, ready } from "./ui-reopen-cycle.mjs";
import { preciseRectangle } from "./ui-reopen-transforms.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function reopenBodyRotation(page, name, duplicate = false) {
  const source = await rotationSource(page),
    before = source.document;
  const nativeBounds = before.bodies[0].bounds;
  const pivot = [0, 1, 2].map((i) => (nativeBounds[i] + nativeBounds[i + 3]) / 2);
  assert.ok(Math.hypot(pivot[0], pivot[1]) > 1, "rotation pivot is off the origin");
  await chooseTool(
    page,
    duplicate ? "duplicate bodies" : "transform",
    duplicate ? "duplicate" : "transform",
  );
  await button(page, "Rotate body Z").click();
  await field(page, "Body rotation Z").fill("30");
  await page.keyboard.press("Enter");
  await cycle(page, {
    before,
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    kind: "transform-bodies",
    name: `${name}-${duplicate ? "duplicate" : "rotate"}`,
    check: async ({ transform }, state, accepted) => {
      assert.deepEqual(transform, {
        ids: [before.bodies[0].id],
        pivot,
        axis: [0, 0, 1],
        translation: [0, 0, 0],
        angle: 30,
        duplicate,
      });
      assert.equal(await field(page, "Body rotation Z").inputValue(), "30");
      validateRotation(accepted, 30, before, pivot, duplicate);
      validateRotation(state.preview, 30, before, pivot, duplicate);
    },
    change: () => field(page, "Body rotation Z").fill("90"),
    validate: async (geometry, parameters, original) => {
      validateRotation(geometry, 90, before, pivot, duplicate);
      if (parameters) assert.deepEqual(parameters.transform, { ...original.transform, angle: 90 });
    },
  });
}

/** Build and independently verify the asymmetric seed through ordinary profile picking and extrusion. */
async function rotationSource(page) {
  const drawn = await preciseRectangle(page);
  const points = drawn.sketches[0].curves.flatMap((curve) => [curve.a, curve.b]);
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const bounds = [Math.min(...xs), Math.min(...ys), 0, Math.max(...xs), Math.max(...ys), 7];
  close(bounds[3] - bounds[0], 10, "independent source width");
  close(bounds[4] - bounds[1], 6, "independent source height");
  const center = await at(page, (bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2);
  await chooseTool(page, "return to modeling", "modeling");
  await completed(page);
  await page.mouse.click(center.x, center.y);
  const selected = await inspect(page);
  assert.equal(selected.modelingSelection.length, 1);
  assert.equal(selected.modelingSelection[0].kind, "profile");
  assert.equal(selected.modelingSelection[0].sketch, drawn.sketches[0].id);
  assert.ok(selected.modelingSelection[0].key);
  close(selected.modelingSelection[0].area, 60, "independent selected profile area");
  assert.equal(selected.modelingSelection[0].holes, 0);
  assert.equal(selected.commands.find((command) => command.id === "extrude").unavailable, null);
  await chooseTool(page, "extrude", "extrude");
  await page.waitForFunction(() =>
    window
      .makeshiftInspect()
      .commands.every((command) => command.unavailable !== "Switching tools…"),
  );
  await button(page, "Drag extrusion").click();
  assert.equal((await inspect(page)).interaction?.kind, "extrude");
  await field(page, "Extrusion distance").fill("7");
  await field(page, "Extrusion distance").press("Enter");
  await ready(page, "Accept extrusion");
  await button(page, "New body").click();
  await ready(page, "Accept extrusion");
  await button(page, "Accept extrusion").click();
  await completed(page);
  await button(page, "Select Body 1").click();
  await orient(page, [1, 1, 1]);
  const source = await inspect(page),
    before = source.document;
  assert.equal(before.bodies.length, 1);
  close(before.bodies[0].volume, 420, "independent asymmetric source volume");
  for (const [i, value] of bounds.entries())
    close(before.bodies[0].bounds[i], value, "source bound");
  return source;
}

function validateRotation(geometry, angle, before, pivot, duplicate) {
  assert.equal(geometry.bodies.length, duplicate ? 2 : 1);
  if (duplicate)
    assert.deepEqual(
      geometry.bodies[0],
      before.bodies[0],
      "duplicate preserves the exact original body",
    );
  const rotated = geometry.bodies[duplicate ? 1 : 0];
  if (!duplicate) assert.equal(rotated.id, before.bodies[0].id);
  else assert.notEqual(rotated.id, before.bodies[0].id);
  close(rotated.volume, 420, "rotation preserves native volume");
  const radians = (angle * Math.PI) / 180;
  const width = 10 * Math.abs(Math.cos(radians)) + 6 * Math.abs(Math.sin(radians));
  const height = 10 * Math.abs(Math.sin(radians)) + 6 * Math.abs(Math.cos(radians));
  [
    pivot[0] - width / 2,
    pivot[1] - height / 2,
    0,
    pivot[0] + width / 2,
    pivot[1] + height / 2,
    7,
  ].forEach((value, i) => {
    close(rotated.bounds[i], value, "independent rotated bound");
  });
  for (const [i, value] of rotated.center.entries())
    close(value, pivot[i], "rotation preserves off-center pivot");
}
