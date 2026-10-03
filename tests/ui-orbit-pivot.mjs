import assert from "node:assert/strict";
import * as THREE from "three";
import { project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { cubeSettled } from "./ui-orientation-cube-clicks.mjs";
import { chooseTool } from "./ui-tools.mjs";

function projected(camera, point) {
  const forward = new THREE.Vector3(...camera.position)
    .sub(new THREE.Vector3(...camera.target))
    .normalize();
  const up = new THREE.Vector3(...camera.up),
    right = up.clone().cross(forward).normalize();
  const delta = new THREE.Vector3(...point).sub(new THREE.Vector3(...camera.target));
  return [delta.dot(right), delta.dot(up)];
}
export async function pressOnPlane(page, xyz) {
  const p = await project(page, xyz);
  const press = { x: Math.round(p.x), y: Math.round(p.y) };
  const { camera: c } = await inspect(page),
    box = await page.locator("canvas").boundingBox();
  const h = c.height / 2,
    w = (h * box.width) / box.height;
  const camera = new THREE.OrthographicCamera(-w, w, h, -h, c.near, c.far);
  camera.position.fromArray(c.position);
  camera.up.fromArray(c.up);
  camera.lookAt(new THREE.Vector3(...c.target));
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      (2 * (press.x - box.x)) / box.width - 1,
      1 - (2 * (press.y - box.y)) / box.height,
    ),
    camera,
  );
  const hit = ray.ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -xyz[2]),
    new THREE.Vector3(),
  );
  return { press, point: hit.toArray() };
}
export function assertPivot(state, expected) {
  assert.equal(state.camera.orbitActive, true);
  state.camera.orbitPivot.forEach((value, i) => {
    assert.ok(
      Math.abs(value - expected[i]) < 0.02,
      `pivot ${state.camera.orbitPivot} expected ${expected}`,
    );
  });
}
async function checkDrag(page, expected, press, cube = false) {
  const before = await inspect(page);
  await page.mouse.move(press.x, press.y);
  if (!cube) await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(press.x + 25, press.y - 20, { steps: 4 });
  const during = await inspect(page);
  assertPivot(during, expected);
  const a = projected(before.camera, expected),
    b = projected(during.camera, expected);
  a.forEach((value, i) => {
    assert.ok(Math.abs(value - b[i]) < 0.02, "Pivot stays at its screen position");
  });
  await page.mouse.move(press.x + 40, press.y - 35);
  assert.deepEqual(
    (await inspect(page)).camera.orbitPivot,
    during.camera.orbitPivot,
    "Pivot freezes for the gesture",
  );
  await page.mouse.move(press.x, press.y);
  const returned = await inspect(page);
  returned.camera.target.forEach((value, i) => {
    assert.ok(Math.abs(value - before.camera.target[i]) < 1e-7);
  });
  await page.mouse.up();
  if (!cube) await page.keyboard.up("Meta");
  assert.deepEqual((await inspect(page)).document, before.document);
}
export async function topWorkspace(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await page.getByRole("button", { name: "Top view", exact: true }).dblclick();
  await cubeSettled(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
}
export async function orbitPivotRoute(page, name) {
  await topWorkspace(page);
  await page.keyboard.press("r");
  await drag(page, [20, 10], [40, 20]);
  const sample = await pressOnPlane(page, [25, 5, 0]);
  await checkDrag(page, [sample.point[0], 10, 0], sample.press);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  const cube = await page.locator(".orientation-cube").boundingBox();
  await checkDrag(
    page,
    [40, 20, 0],
    { x: cube.x + cube.width / 2, y: cube.y + cube.height / 2 },
    true,
  );
  await reset(page);
  const before = await inspect(page),
    box = await page.locator("canvas").boundingBox();
  await checkDrag(page, before.camera.target, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  console.log(
    `${name}: nearest wire fallback ignores selection; cube uses viewport press; empty scene retains target`,
  );
}
export async function makePivotBox(page) {
  await topWorkspace(page);
  await page.keyboard.press("r");
  await drag(page, [-16, -16], [16, 16]);
  const pick = await at(page, 3, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("12");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 1);
}
export async function surfacePivotRoute(page, name) {
  await makePivotBox(page);
  const direct = await pressOnPlane(page, [5, 4, 12]);
  await checkDrag(page, direct.point, direct.press);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  const outside = await pressOnPlane(page, [24, 2, 12]);
  await checkDrag(page, [16, outside.point[1], 12], outside.press);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const second = await pressOnPlane(page, [-5, -6, 12]);
  await checkDrag(page, second.point, second.press);
  console.log(
    `${name}: direct mouse ray and nearest visible surface on a miss; selection does not override pivot`,
  );
}
