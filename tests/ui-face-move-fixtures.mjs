import assert from "node:assert/strict";
import * as THREE from "three";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function makeFeature(
  page,
  pocket = false,
  sides = 4,
  through = false,
  precise = false,
) {
  const { stock, top } = await createFeatureStock(page, precise);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  const local = (point) => {
    const delta = new THREE.Vector3(...point).sub(new THREE.Vector3(...top.plane.origin));
    return [
      delta.dot(new THREE.Vector3(...top.plane.u)),
      delta.dot(new THREE.Vector3(...top.plane.v)),
    ];
  };
  await drawFeatureProfile(page, local, sides, precise);
  const center = await at(page, ...local(sides === -6 ? [-1, -1, 5] : [0, 0, 5]));
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.keyboard.press("e");
  await inspect(page);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Extrusion distance" })
    .fill(through ? "-5" : pocket ? "-2" : "6");
  const preview = await inspect(page);
  assert.ok(
    preview.preview,
    JSON.stringify({
      selection: preview.modelingSelection,
      notice: await page.getByRole("status").textContent(),
      tool: preview.modelingTool,
      interaction: preview.interaction,
      activePlane: preview.activePlane,
      busy: preview.busy,
      input: await page.getByRole("textbox", { name: "Extrusion distance" }).inputValue(),
      active: await page.evaluate(() => document.activeElement?.outerHTML),
    }),
  );
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await inspect(page);
  for (const index of [1, 2]) {
    const hide = page.getByRole("button", { name: `Hide Sketch ${index}`, exact: true });
    if (await hide.count()) await hide.click();
    assert.equal(
      await page.getByRole("button", { name: `Show Sketch ${index}`, exact: true }).count(),
      1,
    );
  }
  const body = (await inspect(page)).document.bodies[0];
  const faces = body.faces.filter(
    (face) =>
      ![0, 1, 2].some((axis) =>
        (precise
          ? [stock.bounds[axis], stock.bounds[axis + 3]]
          : axis === 2
            ? [0, 5]
            : [-10, 10]
        ).some((value) =>
          face.vertices.every((n, i) => i % 3 !== axis || Math.abs(n - value) < 1e-6),
        ),
      ),
  );
  assert.equal(faces.length, (sides ? Math.abs(sides) : 1) + (through ? 0 : 1));
  if (pocket) {
    await page.mouse.move(640, 425);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -140);
    await page.keyboard.up("Control");
    await inspect(page);
  }
  return { body, faces };
}
/** Create and pick the stock's accepted top support before drawing the feature profile. */
async function createFeatureStock(page, precise) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await drawFeatureRectangle(page, [-10, -10], [10, 10], precise);
  const pick = await at(page, 6, 6);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await inspect(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await inspect(page);
  await worldClick(page, [6, 6, 5]);
  const stock = (await inspect(page)).document.bodies[0];
  const top = stock.faces.find((face) =>
    face.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 5) < 1e-6),
  );
  return { stock, top };
}
/** Keep precise seed creation on ordinary controls and restore its prior grid setting. */
async function drawFeatureRectangle(page, from, to, precise) {
  const grid = precise ? (await inspect(page)).gridSnap : false;
  if (grid) await chooseTool(page, "grid snap", "grid");
  try {
    await page.keyboard.press("r");
    await drag(page, from, to, precise ? ["Shift"] : []);
    if (precise) {
      for (const [axis, label] of ["Width", "Height"].entries()) {
        const input = page.getByRole("textbox", { name: label, exact: true });
        await input.fill(String(Math.abs(to[axis] - from[axis])));
        await input.press("Enter");
        await inspect(page);
      }
    }
  } finally {
    if (grid) await chooseTool(page, "grid snap", "grid");
  }
}
async function drawFeatureProfile(page, local, sides, precise = false) {
  if (sides === 4) {
    await drawFeatureRectangle(page, local([-2, -3, 5]), local([2, 3, 5]), precise);
  } else if (!sides) {
    await page.keyboard.press("c");
    await drag(page, local([0, 0, 5]), local([2, 0, 5]));
    await page.keyboard.press("Enter");
  } else {
    const points =
      sides === -6
        ? [
            [-3, -3],
            [3, -3],
            [3, 0],
            [0, 0],
            [0, 3],
            [-3, 3],
          ].map(([x, y]) => local([x, y, 5]))
        : Array.from({ length: sides }, (_, i) =>
            local([
              3 * Math.cos((2 * Math.PI * i) / sides),
              3 * Math.sin((2 * Math.PI * i) / sides),
              5,
            ]),
          );
    for (let i = 0; i < points.length; i++) {
      await page.keyboard.press("l");
      await drag(page, points[i], points[(i + 1) % points.length]);
    }
  }
}
export async function pickFeatureFace(page, face, add = false, pocket = false, round = false) {
  const normal = face.cylinder
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(...face.plane.u).cross(new THREE.Vector3(...face.plane.v));
  const yaw = Math.atan2(normal.y, normal.x),
    pitch = Math.min(Math.acos(normal.z), pocket ? 0.6 : Math.PI);
  await orient(page, [
    Math.cos(yaw) * Math.sin(pitch),
    Math.sin(yaw) * Math.sin(pitch),
    Math.cos(pitch),
  ]);
  // Pick the exposed half of a horizontal face, away from the existing local card.
  const offsetIndex = normal.z > 0.9 && add ? face.vertices.length - 9 : 0;
  const center = new THREE.Vector3()
    .fromArray(face.vertices, offsetIndex)
    .add(new THREE.Vector3().fromArray(face.vertices, offsetIndex + 3))
    .add(new THREE.Vector3().fromArray(face.vertices, offsetIndex + 6))
    .multiplyScalar(1 / 3);
  if (face.cylinder) {
    const c = face.cylinder;
    const heights = face.vertices.filter((_, i) => i % 3 === 2);
    center.set(
      c.origin[0] + c.radius * c.outward,
      c.origin[1],
      (Math.min(...heights) + Math.max(...heights)) / 2,
    );
  } else if (round || Math.abs(normal.z) < 0.9) {
    // Use the interior of narrow walls and circular caps, outside rim-pick tolerance.
    for (let axis = 0; axis < 3; axis++) {
      const values = face.vertices.filter((_, i) => i % 3 === axis);
      center.setComponent(axis, (Math.min(...values) + Math.max(...values)) / 2);
    }
  }
  await worldClick(page, center.toArray(), add);
  const state = await inspect(page);
  if (!state.modelingSelection.some((t) => t.face === face.id))
    await page.screenshot({ path: ".cache/sketch-review/face-pick-failure.png" });
  assert.ok(
    state.modelingSelection.some((t) => t.face === face.id),
    JSON.stringify({
      expected: face.id,
      normal: normal.toArray(),
      center: center.toArray(),
      actual: state.modelingSelection,
      camera: state.camera,
    }),
  );
}
