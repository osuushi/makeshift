import assert from "node:assert/strict";
import { orient, outwardDrag, project, selectSurface } from "./ui-blend-edit.mjs";
import { circularFinish, plate } from "./ui-body-fillet.mjs";
import {
  at,
  click,
  close,
  drag,
  inspect,
  modalCompleted,
  pointEquals,
  reset,
} from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function sketchZero(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [0, 10], ["Shift"]);
  await page.keyboard.press("v");
  await click(page, 6, 0);
  await page.keyboard.down("Shift");
  await click(page, 0, 6);
  await page.keyboard.up("Shift");
  await chooseTool(page, "fillet sketch", "sketch-fillet");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("0");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 2);
  await chooseTool(page, "fillet sketch", "sketch-fillet");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  await page.getByRole("button", { name: "Lock Radius", exact: true }).click();
  const rounded = (await inspect(page)).document;
  const input = page.getByRole("textbox", { name: "Radius", exact: true });
  await input.fill("0");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  let sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.curves.length, 2);
  for (const line of sketch.curves) pointEquals(line.a, [0, 0]);
  assert.ok(!sketch.constraints.some((c) => c.kind === "radius" || c.kind === "tangent"));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, rounded);
  // Remove the radius lock, then drag the existing fillet through the hard corner.
  await page.getByRole("button", { name: "Unlock Radius", exact: true }).click();
  const unlocked = (await inspect(page)).document;
  await page.locator(".bow-handle").waitFor({ state: "visible" });
  const handle = await page.locator(".bow-handle").boundingBox();
  const target = await at(page, -1, -1);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await modalCompleted(page);
  sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.curves.length, 2);
  for (const line of sketch.curves) pointEquals(line.a, [0, 0]);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, unlocked);
}

async function solidZero(page, name, mode) {
  await circularFinish(page, name, mode);
  const rounded = (await inspect(page)).document;
  await chooseTool(page, "Reopen last operation", "reopen-operation");
  const edgeInput = page.getByRole("textbox", {
    name: mode === "fillet" ? "Fillet radius" : "Chamfer distance",
    exact: true,
  });
  await edgeInput.fill("0");
  await previewActionReady(page, `Accept ${mode}`);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  close((await inspect(page)).document.bodies[0].volume, 640 * Math.PI);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, rounded);
  const face = rounded.bodies[0].faces.find((f) => (mode === "fillet" ? f.blend : f.chamfer));
  assert.ok(face);
  const action = mode === "fillet" ? "Resize fillet" : "Resize chamfer";
  const input = page.getByRole("textbox", {
    name: mode === "fillet" ? "Fillet face radius" : "Chamfer face distance",
  });
  await selectSurface(page, face);
  await page.getByRole("button", { name: action, exact: true }).click();
  await input.fill("0");
  await previewActionReady(page, "Accept face offset");
  let state = await inspect(page);
  assert.deepEqual(state.document, rounded);
  close(state.preview.bodies[0].volume, 640 * Math.PI);
  assert.equal(state.preview.bodies[0].faces.length, 3);
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  assert.deepEqual((await inspect(page)).document, rounded);
  await page.getByRole("button", { name: action, exact: true }).click();
  await input.fill("0");
  await previewActionReady(page, "Accept face offset");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  state = await inspect(page);
  close(state.document.bodies[0].volume, 640 * Math.PI);
  assert.equal(state.modelingSelection[0]?.kind, "body");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, rounded);
  await selectSurface(page, face);
  await outwardDrag(page, action, face, 4);
  await previewActionReady(page, "Accept face offset");
  close(Number(await input.inputValue()), 0);
  close((await inspect(page)).preview.bodies[0].volume, 640 * Math.PI);
  await page.getByRole("button", { name: "Accept face offset" }).click();
  await modalCompleted(page);
  close((await inspect(page)).document.bodies[0].volume, 640 * Math.PI);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, rounded);
}

async function cubeZero(page, mode) {
  await plate(page);
  const stock = (await inspect(page)).document.bodies[0];
  await page.keyboard.press("Escape");
  await orient(page, [-1, -1, 0.4]);
  const edge = await project(page, [-10, -10, 5]);
  await page.mouse.click(edge.x, edge.y);
  await chooseTool(page, mode, mode);
  await page
    .getByRole("button", {
      name: mode === "fillet" ? "Fillet edges" : "Chamfer edges",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", {
      name: mode === "fillet" ? "Fillet radius" : "Chamfer distance",
      exact: true,
    })
    .fill("2");
  await previewActionReady(page, `Accept ${mode}`);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const rounded = (await inspect(page)).document;
  const face = rounded.bodies[0].faces.find((f) => (mode === "fillet" ? f.blend : f.chamfer));
  assert.ok(face);
  // Planar faces use the frontend's normal fallback rather than a kernel handle.
  const target = face.offsetHandle
    ? face
    : {
        ...face,
        offsetHandle: {
          center: [-9, -9, 5],
          normal: [-Math.SQRT1_2, -Math.SQRT1_2, 0],
        },
      };
  await selectSurface(page, target);
  await outwardDrag(page, mode === "fillet" ? "Resize fillet" : "Resize chamfer", target, 4);
  await previewActionReady(page, "Accept face offset");
  const preview = (await inspect(page)).preview.bodies[0];
  close(preview.volume, stock.volume);
  assert.equal(preview.faces.length, stock.faces.length);
  assert.ok(!preview.faces.some((f) => f.id === face.id));
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "body");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, rounded);
}

export async function zeroCornerRoute(page, name) {
  await sketchZero(page);
  await solidZero(page, name, "fillet");
  await solidZero(page, name, "chamfer");
  await cubeZero(page, "fillet");
  await cubeZero(page, "chamfer");
  console.log(`${name}: zero corner numeric/drag, healing, Cancel and Undo passed`);
}
