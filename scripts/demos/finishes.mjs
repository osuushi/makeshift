import assert from "node:assert/strict";
import { placed } from "./primitives.mjs";

export async function finishes(page, c, a) {
  await a.tool("cube");
  await a.dragWorld([-8, -8, 0], [8, 8, 0], 0.7);
  await placed(a, 1);
  const original = (await a.state()).document.bodies[0];
  await page.keyboard.press("Escape");
  // Pick geometry away from midpoint and face-center guide markers.
  await a.click([8, -8, 4]);
  assert.equal((await a.state()).modelingSelection[0]?.kind, "edge");
  await a.button("Fillet edges");
  await a.fill("Fillet radius", 3, "textbox", false);
  await a.button("Accept fillet");
  const rounded = (await a.state()).document.bodies[0];
  assert.ok(rounded.volume < original.volume);
  assert.ok(rounded.faces.some((face) => face.blend));
  await c.hold(0.6);
  await page.keyboard.press("Escape");
  await a.click([2, 3, 16]);
  const topSelection = (await a.state()).modelingSelection[0];
  assert.equal(topSelection?.kind, "face");
  const top = rounded.faces.find((face) => face.id === topSelection.face);
  await a.tool("chamfer");
  const perimeter = (await a.state()).modelingSelection;
  assert.deepEqual(perimeter.map((target) => target.edge).sort(), [...top.edges].sort());
  await a.button("Chamfer edges");
  await a.fill("Chamfer distance", 2, "textbox", false);
  await a.button("Accept chamfer");
  const beveled = (await a.state()).document.bodies[0];
  assert.ok(beveled.volume < rounded.volume);
  assert.ok(beveled.faces.some((face) => face.blend));
  // Verify the actual top-face setback; recognition labels are not operation history.
  const cap = beveled.faces.find(
    (face) =>
      face.plane && face.vertices.every((value, i) => i % 3 !== 2 || Math.abs(value - 16) < 1e-5),
  );
  assert.ok(cap);
  for (const axis of [0, 1]) {
    const coordinates = cap.vertices.filter((_, i) => i % 3 === axis);
    assert.ok(Math.abs(Math.min(...coordinates) + 6) < 1e-4);
    assert.ok(Math.abs(Math.max(...coordinates) - 6) < 1e-4);
  }
  assert.ok(beveled.faces.length > rounded.faces.length);
}
