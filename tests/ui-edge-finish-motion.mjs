import assert from "node:assert/strict";
import * as THREE from "three";
import { orient, project } from "./ui-blend-edit.mjs";
import {
  dragSize,
  edgeFinishPrism,
  finishHistory,
  pickWorld,
  sizeInput,
} from "./ui-edge-finish-fixtures.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

function generatedSurfaceCenter(body, original) {
  const old = new Set(original.faces.map((f) => f.id));
  const faces = body.faces.filter((f) => !old.has(f.id));
  assert.equal(faces.length, 1, "A single finished edge creates one new surface");
  const center = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < faces[0].vertices.length; i += 9) {
    const triangle = new THREE.Triangle(
      new THREE.Vector3().fromArray(faces[0].vertices, i),
      new THREE.Vector3().fromArray(faces[0].vertices, i + 3),
      new THREE.Vector3().fromArray(faces[0].vertices, i + 6),
    );
    const weight = triangle.getArea();
    center.addScaledVector(triangle.getMidpoint(new THREE.Vector3()), weight);
    area += weight;
  }
  assert.ok(area > 0);
  return center.divideScalar(area).toArray();
}

export async function assertSurfaceMovement(page, state, original, anchor, sign, mode) {
  const size = Number(await sizeInput(page, mode).inputValue());
  assert.ok(size > 0);
  const body = state.preview.bodies[0];
  assert.ok(
    sign * (body.volume - original.bodies[0].volume) > 0,
    "Convex finishes remove material; concave finishes add material",
  );
  const start = await project(page, anchor);
  const expected = await project(page, [anchor[0] + sign, anchor[1] + sign, anchor[2]]);
  const direction = new THREE.Vector2(expected.x - start.x, expected.y - start.y).normalize();
  const handle = page.getByRole("button", {
    name: mode === "fillet" ? "Fillet edges" : "Chamfer edges",
    exact: true,
  });
  const actual = new THREE.Vector2(
    Number(await handle.getAttribute("data-direction-x")),
    Number(await handle.getAttribute("data-direction-y")),
  );
  assert.ok(
    actual.dot(direction) > 0.999,
    "Pointer mapping agrees with independent expected surface direction",
  );
  const center = generatedSurfaceCenter(body, original.bodies[0]);
  const result = await project(page, center);
  assert.ok(
    new THREE.Vector2(result.x - start.x, result.y - start.y).dot(actual) > 0.1,
    "The actual kernel surface moves in the pointer direction",
  );
  return center;
}

async function cameraDrags(page, mode, original, anchor, sign, name) {
  for (const normal of [
    [1, 1, 1],
    [1, 2, 0.5],
    [2, 1, 1.5],
  ]) {
    await orient(page, normal);
    const selection = await pickWorld(page, anchor);
    assert.equal(selection.modelingSelection.length, 1);
    assert.equal(selection.modelingSelection[0].kind, "edge");
    await chooseTool(page, mode, mode);
    const state = await dragSize(page, mode, 18);
    assert.deepEqual(state.document, original);
    const center = await assertSurfaceMovement(page, state, original, anchor, sign, mode);
    await sizeInput(page, mode).fill("3");
    const larger = await inspect(page);
    const next = await assertSurfaceMovement(page, larger, original, anchor, sign, mode);
    assert.ok(
      sign * (next[0] + next[1] - center[0] - center[1]) > 0,
      "Increasing the numeric size continues the same actual surface movement",
    );
    await page.screenshot({
      path: `.cache/sketch-review/${name}-${mode}-${sign > 0 ? "concave" : "convex"}-motion.png`,
    });
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, original);
  }
}

async function modeAndFallback(page, original, anchor, mode) {
  await orient(page, [1, 1, 1]);
  await pickWorld(page, anchor);
  await chooseTool(page, mode, mode);
  await dragSize(page, mode);
  const before = Number(await sizeInput(page, mode).inputValue());
  const other = mode === "fillet" ? "chamfer" : "fillet";
  await page.getByRole("button", { name: `Switch to ${other}`, exact: true }).click();
  assert.ok(Math.abs(Number(await sizeInput(page, other).inputValue()) - before) < 0.001);
  await sizeInput(page, other).fill("1");
  await inspect(page);
  await finishHistory(page, other, original);
  await chooseTool(page, "undo", "undo");
  await page.keyboard.press("Escape");
  await pickWorld(page, anchor);
  await chooseTool(page, mode, mode);
  await orient(page, [1, 1, 0]);
  await page.getByRole("button", { name: "Right Back view", exact: true }).focus();
  await page.keyboard.press("Enter");
  await inspect(page);
  const handle = page.getByRole("button", {
    name: mode === "fillet" ? "Fillet edges" : "Chamfer edges",
    exact: true,
  });
  assert.equal(Number(await handle.getAttribute("data-direction-x")), 0);
  assert.equal(Number(await handle.getAttribute("data-direction-y")), 0);
  await handle.click();
  await sizeInput(page, mode).fill("1");
  assert.ok((await inspect(page)).preview);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}

export async function edgeFinishMotionRoute(page, name) {
  for (const concave of [false, true]) {
    const original = await edgeFinishPrism(page, concave);
    const anchor = concave ? [0, 0, 5] : [10, 10, 5],
      sign = concave ? 1 : -1;
    for (const mode of ["fillet", "chamfer"])
      await cameraDrags(page, mode, original, anchor, sign, name);
    await modeAndFallback(page, original, anchor, "fillet");
  }
  console.log(
    `${name}: convex/concave Fillet/Chamfer surface displacement in three views, numeric continuity, mode switch, edge-on fallback and history passed`,
  );
}
