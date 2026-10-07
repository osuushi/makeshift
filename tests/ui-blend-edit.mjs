import assert from "node:assert/strict";
import * as THREE from "three";
import { circularFinish, plate } from "./ui-body-fillet.mjs";
import { close, inspect, modalCompleted } from "./ui-helpers.mjs";
import { orientWithTurntable } from "./ui-orbit-orient.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function project(page, xyz) {
  const { camera } = await inspect(page),
    box = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  const h = camera.height / 2,
    w = (h * box.width) / box.height;
  const view = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 10000);
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  view.updateMatrixWorld();
  const p = new THREE.Vector3(...xyz).project(view);
  return { x: box.x + ((p.x + 1) * box.width) / 2, y: box.y + ((1 - p.y) * box.height) / 2 };
}
export async function orient(page, normal) {
  await orientWithTurntable(page, normal);
}

export async function selectSurface(page, face) {
  const { center, normal } = face.offsetHandle;
  // A selected body owns a transform box that can cover a narrow blend face.
  await page.keyboard.press("Escape");
  await orient(page, [normal[0] - normal[1] * 0.6, normal[1] + normal[0] * 0.6, normal[2] + 0.3]);
  const p = await project(page, center);
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, face.id);
}
export async function outwardDrag(page, action, face, amount = 1) {
  const { center, normal } = face.offsetHandle;
  const a = await project(page, center),
    b = await project(
      page,
      center.map((v, i) => v + normal[i] * amount),
    );
  const box = await page.getByRole("button", { name: action, exact: true }).boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + b.x - a.x, y + b.y - a.y, { steps: 4 });
  await page.mouse.up();
  return inspect(page);
}
async function roundEdit(page, name, mode) {
  await circularFinish(page, name, mode);
  await page.mouse.move(640, 425);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -90);
  await page.keyboard.up("Control");
  await page.waitForFunction(() => window.makeshiftInspect().camera.height < 40);
  const original = (await inspect(page)).document;
  const face = original.bodies[0].faces.find((f) => (mode === "fillet" ? f.blend : f.chamfer));
  assert.ok(face);
  await selectSurface(page, face);
  const action = mode === "fillet" ? "Resize fillet" : "Resize chamfer";
  await page.getByRole("button", { name: action, exact: true }).click();
  const input = page.getByRole("textbox", {
    name: mode === "fillet" ? "Fillet face radius" : "Chamfer face distance",
  });
  await input.fill("3");
  let state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.ok(state.preview);
  if (mode === "fillet") close(state.preview.bodies[0].faces.find((f) => f.blend).blend.radius, 3);
  else close(state.preview.bodies[0].faces.find((f) => f.chamfer).chamfer.distance, 3);
  await page.getByRole("button", { name: "Accept face offset" }).click();
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await selectSurface(page, face);
  state = await outwardDrag(page, action, face);
  assert.ok(state.preview, "Outward drag has a valid candidate");
  assert.ok(
    state.preview.bodies[0].volume > original.bodies[0].volume,
    "Outward drag adds material",
  );
  if (mode === "fillet") assert.ok(Number(await input.inputValue()) < 2);
  else assert.ok(Number(await input.inputValue()) < 2);
  await page.screenshot({ path: `.cache/sketch-review/${name}-${mode}-face-drag.png` });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}
async function flatChamferDrag(page, name) {
  await plate(page);
  await orient(page, [-1, -1, 0.4]);
  const edge = await project(page, [-10, -10, 5]);
  await page.mouse.click(edge.x, edge.y);
  await chooseTool(page, "chamfer", "chamfer");
  await page.getByRole("button", { name: "Chamfer edges", exact: true }).click();
  await page.getByRole("textbox", { name: "Chamfer distance" }).fill("4");
  await inspect(page);
  await previewActionReady(page, "Accept chamfer");
  await page.getByRole("button", { name: "Accept chamfer" }).click();
  await modalCompleted(page);
  const original = (await inspect(page)).document;
  const face = original.bodies[0].faces.find((f) => {
    if (!f.plane) return false;
    const n = new THREE.Vector3(...f.plane.u).cross(new THREE.Vector3(...f.plane.v));
    return Math.abs(n.x) > 0.1 && Math.abs(n.y) > 0.1 && Math.abs(n.z) < 0.01;
  });
  assert.ok(face, "Diagonal chamfer face");
  // Independent expected outward direction: oriented render triangle, not plane frame.
  const a = new THREE.Vector3().fromArray(face.vertices, 0),
    b = new THREE.Vector3().fromArray(face.vertices, 3),
    c = new THREE.Vector3().fromArray(face.vertices, 6);
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize().toArray();
  const target = { ...face, offsetHandle: { center: [-8, -8, 5], normal } };
  await selectSurface(page, target);
  const state = await outwardDrag(page, "Resize chamfer", target, 2);
  assert.ok(state.preview.bodies[0].volume > original.bodies[0].volume);
  assert.ok(
    Number(await page.getByRole("textbox", { name: "Chamfer face distance" }).inputValue()) < 4,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-chamfer-outward-drag.png` });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}
export async function blendEditRoute(page, name) {
  await flatChamferDrag(page, name);
  await roundEdit(page, name, "fillet");
  await roundEdit(page, name, "chamfer");
  console.log(
    `${name}: planar chamfer outward drag, toroidal fillet resize and conical chamfer offset, numeric/drag/Undo/cancel passed`,
  );
}
