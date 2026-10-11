import assert from "node:assert/strict";
import { orient } from "../../tests/ui-blend-edit.mjs";

export const groundView = (page) => orient(page, [1, -1.4, 1.1]);

export async function placed(a, count) {
  assert.ok(
    (await a.state()).preview?.bodies.length,
    "Primitive hands off to an editable solid preview",
  );
  await a.accept();
  const state = await a.state();
  assert.equal(state.document.bodies.length, count);
  assert.ok(state.document.bodies.every((body) => body.volume > 0));
  return state.document.bodies;
}

export async function primitives(_page, _c, a) {
  await a.tool("cube");
  await a.hover([-17, -6, 0], 0.7);
  await a.hover([-15, -5, 0], 0.7);
  await a.click([-15, -5, 0]);
  await placed(a, 1);
  await a.tool("cylinder");
  await a.hover([0, -5, 0], 0.25);
  await a.dragWorld([0, -5, 0], [4, -5, 0], 1.1, true);
  const cylinder = (await placed(a, 2))[1];
  assert.ok(cylinder.faces.some((face) => face.cylinder));
  await a.tool("sphere");
  await a.hover([-15, 10, 0], 0.2);
  await a.dragWorld([-15, 10, 0], [-10.5, 10, 0], 0.8, true);
  const sphere = (await placed(a, 3))[2];
  assert.ok(sphere.faces.some((face) => face.sphere));
  await a.tool("cone");
  await a.hover([0, 10, 0], 0.2);
  await a.dragWorld([0, 10, 0], [4, 10, 0], 0.65, true);
  const before = (await a.state()).preview.bodies.at(-1);
  await a.dragHandle("Drag extrusion", [0, 10, 0], [0, 10, 5], 1.4);
  const cone = (await placed(a, 4))[3];
  assert.ok(cone.faces.some((face) => face.cone));
  assert.ok(cone.bounds[5] - cone.bounds[2] > before.bounds[5] - before.bounds[2]);
}
