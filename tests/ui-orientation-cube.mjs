import assert from "node:assert/strict";
import * as THREE from "three";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { navigationRoundTrip, navigationTips } from "./ui-navigation-history.mjs";
import { orientWithTurntable } from "./ui-orbit-orient.mjs";
import { cubeSettled } from "./ui-orientation-cube-clicks.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function orientationCubeRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  const before = await inspect(page);
  assert.equal(before.document.sketches.length, 1, "Rectangle creation reaches the real solver");
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  assert.equal((await cubeSettled(page)).activePlane, null);
  const history = await page.evaluate(() => window.makeshiftHistory());
  const cube = page.locator(".orientation-cube");
  const bounds = await cube.boundingBox();
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const tools = await page.getByRole("button", { name: /Tools/ }).first().boundingBox();
  assert.ok(tools.x + tools.width < bounds.x, "Tools does not overlap the cube");
  const normals = {
    Front: [0, -1, 0],
    Back: [0, 1, 0],
    Left: [-1, 0, 0],
    Right: [1, 0, 0],
    Top: [0, 0, 1],
    Bottom: [0, 0, -1],
  };
  for (const [face, normal] of Object.entries(normals)) {
    // Reveal the face with real pointer navigation, independent of snap-axis boundaries.
    await orientWithTurntable(page, normal);
    const target = page.getByRole("button", { name: `${face} view`, exact: true });
    await assertFaceLabel(target);
    const beforeAlignment = await inspect(page);
    await target.locator("polygon").click();
    const state = await cubeSettled(page);
    const offset = state.camera.position.map((v, i) => v - state.camera.target[i]);
    const distance = Math.hypot(...offset);
    offset.forEach((v, i) => {
      assert.ok(Math.abs(v / distance - normal[i]) < 1e-8);
    });
    assert.deepEqual(state.camera.target, beforeAlignment.camera.target);
    assert.equal(state.camera.height, before.camera.height);
    assert.deepEqual(state.document, before.document);
    await target.locator("polygon").dblclick();
    const canonical = (await cubeSettled(page)).camera;
    const expectedUp = face === "Top" ? [0, 1, 0] : face === "Bottom" ? [0, -1, 0] : [0, 0, 1];
    canonical.up.forEach((v, i) => {
      assert.ok(Math.abs(v - expectedUp[i]) < 1e-8);
    });
  }
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x - 35, center.y + 25, { steps: 6 });
  assert.equal((await inspect(page)).camera.orbitActive, true);
  await page.keyboard.press("Escape");
  const canceled = await inspect(page);
  await page.mouse.up();
  assert.equal(canceled.camera.orbitActive, false);
  assert.deepEqual((await inspect(page)).camera, canceled.camera);
  const visible = cube.locator('[role="button"]:visible').first();
  await visible.focus();
  await navigationRoundTrip(page, () => page.keyboard.press("Enter"), "Cube keyboard activation");
  const geometric = (entries) => entries.filter((entry) => entry.operation.kind !== "navigation");
  assert.deepEqual(
    geometric(await page.evaluate(() => window.makeshiftHistory())),
    geometric(history),
    "Cube gestures leave accepted geometry history unchanged",
  );
  assert.ok((await navigationTips(page)).length > 1, "Cube gestures retain the view suffix");
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 24, center.y + 18, { steps: 6 });
  await page.mouse.up();
  await inspect(page);
  await cubeRoll(page, center);
  await page.screenshot({ path: `.cache/sketch-review/${name}-orientation-cube.png` });
  console.log(
    `${name}: cube face alignment, drag, Escape, keyboard view Undo/Redo and unchanged geometry history passed`,
  );
}

async function assertFaceLabel(target) {
  const face = await target.evaluate((group) => {
    const points = Array.from(group.querySelector("polygon").points);
    const m = group.querySelector("text").transform.baseVal.consolidate().matrix;
    return { points: points.map(({ x, y }) => [x, y]), matrix: [m.a, m.b, m.c, m.d, m.e, m.f] };
  });
  // SVG DOM matrices/point lists round to float32: allow far less than one pixel.
  const [a, b, c, d, x, y] = face.matrix;
  const edgeX = face.points[1][0] - face.points[0][0];
  const edgeY = face.points[1][1] - face.points[0][1];
  const upX = face.points[2][0] - face.points[1][0];
  const upY = face.points[2][1] - face.points[1][1];
  assert.ok(
    Math.abs(a * edgeY - b * edgeX) < 1e-4,
    "Text baseline lies on the projected face axis",
  );
  assert.ok(Math.abs(c * upY - d * upX) < 1e-4, "Text height foreshortens with its face");
  assert.ok(Math.abs(x - face.points.reduce((sum, p) => sum + p[0], 0) / 4) < 1e-4);
  assert.ok(Math.abs(y - face.points.reduce((sum, p) => sum + p[1], 0) / 4) < 1e-4);
}

async function cubeRoll(page, center) {
  const before = await inspect(page);
  await page.mouse.move(center.x + 24, center.y);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(center.x + 40, center.y, { steps: 4 });
  const radial = await inspect(page);
  assert.ok(
    new THREE.Vector3(...radial.camera.up).distanceTo(new THREE.Vector3(...before.camera.up)) <
      1e-10,
    "Radial cube drag adds no roll",
  );
  for (let i = 1; i <= 12; i++) {
    const angle = (i * Math.PI) / 24;
    await page.mouse.move(center.x + 40 * Math.cos(angle), center.y + 40 * Math.sin(angle));
  }
  const during = await inspect(page);
  const axis = new THREE.Vector3(...before.camera.position)
    .sub(new THREE.Vector3(...before.camera.target))
    .normalize();
  const expected = new THREE.Vector3(...before.camera.up).applyAxisAngle(axis, Math.PI / 2);
  assert.ok(
    new THREE.Vector3(...during.camera.up).distanceTo(expected) < 1e-8,
    "Quarter-circle around cube center produces exactly a quarter-turn",
  );
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const after = await inspect(page);
  assert.notDeepEqual(during.camera.up, before.camera.up);
  const afterAxis = new THREE.Vector3(...after.camera.position)
    .sub(new THREE.Vector3(...after.camera.target))
    .normalize();
  assert.ok(
    afterAxis.distanceTo(axis) < 1e-8,
    "Roll preserves view direction around its geometry pivot",
  );
  assert.deepEqual(after.document, before.document);
}
