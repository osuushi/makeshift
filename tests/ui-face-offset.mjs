import assert from "node:assert/strict";
import * as THREE from "three";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function worldClick(page, xyz, shift = false) {
  const { camera } = await inspect(page),
    box = await page.locator("canvas").boundingBox();
  const h = camera.height / 2,
    w = (h * box.width) / box.height;
  const view = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 10000);
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  view.updateMatrixWorld();
  const p = new THREE.Vector3(...xyz).project(view);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(box.x + ((p.x + 1) * box.width) / 2, box.y + ((1 - p.y) * box.height) / 2);
  if (shift) await page.keyboard.up("Shift");
}
export async function makePlate(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [2, 0]);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("1.5");
  await page.keyboard.press("Enter");
  await inspect(page);
  const region = await at(page, 6, 6);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(region.x, region.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const state = await inspect(page);
  close(state.document.bodies[0].volume, (400 - Math.PI * 1.5 ** 2) * 5);
  return state.document;
}
async function verifiedOffsetReady(page) {
  await page.waitForFunction(
    () =>
      !window.makeshiftInspect().busy &&
      !document.querySelector('.face-offset-widget [aria-label="Accept face offset"]')?.disabled,
  );
}
async function planarOffset(page, name) {
  const original = await makePlate(page);
  await worldClick(page, [6, 6, 5]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const input = await relativeOffsetInput(page);
  await input.fill("2");
  let state = await inspect(page);
  assert.deepEqual(state.document, original);
  close(state.preview.bodies[0].volume, (400 - Math.PI * 1.5 ** 2) * 7);
  await page.screenshot({ path: `.cache/sketch-review/${name}-planar-offset.png` });
  await input.fill("-10");
  await verifiedOffsetReady(page);
  assert.equal(await page.getByRole("button", { name: "Accept face offset" }).isEnabled(), true);
  assert.ok(Number(await input.inputValue()) > -5);
  assert.equal(
    await page
      .getByRole("button", { name: "Offset faces", exact: true })
      .getAttribute("data-geometry-invalid"),
    "true",
  );
  assert.ok((await inspect(page)).preview.bodies[0].volume > 0);
  await input.fill("");
  await input.pressSequentially("-1");
  await inspect(page);
  assert.doesNotMatch(await page.getByRole("status").textContent(), /Enter a finite/);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  // Direct drag, release leaves temporary geometry, and zero makes no document edit.
  const handle = page.getByRole("button", { name: "Offset faces", exact: true }),
    box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 22, { steps: 5 });
  await page.mouse.up();
  state = await inspect(page);
  assert.ok(state.preview.bodies[0].volume > original.bodies[0].volume);
  assert.deepEqual(state.document, original);
  await (await relativeOffsetInput(page)).fill("0");
  await inspect(page);
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  await handle.click();
  await (await relativeOffsetInput(page)).fill("2");
  await inspect(page);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].bounds[5], 7 + 1e-7);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies[0].bounds[5], 7 + 1e-7);
}
async function holeOffset(page, name, electron, cleanup = false) {
  const original = await makePlate(page);
  await orient(page, [0, -Math.sin(0.35), Math.cos(0.35)]);
  await worldClick(page, [0, 1.5, 2.5]);
  let state = await inspect(page);
  const hole = original.bodies[0].faces.find((f) => f.cylinder);
  assert.equal(state.modelingSelection[0]?.face, hole.id, "Pick the actual inner cylindrical wall");
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const radius = page.getByRole("textbox", { name: "Face radius", exact: true });
  close(Number(await radius.inputValue()), 1.5);
  await radius.fill("2.5");
  close((await inspect(page)).preview.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
  const distance = await relativeOffsetInput(page);
  close(Number(await distance.inputValue()), -1);
  await distance.fill("-1");
  state = await inspect(page);
  close(state.preview.bodies[0].faces.find((f) => f.id === hole.id).cylinder.radius, 2.5);
  close(state.preview.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
  assert.deepEqual(state.document, original);
  await page.screenshot({ path: `.cache/sketch-review/${name}-hole-diameter.png` });
  await distance.fill("1.5");
  await verifiedOffsetReady(page);
  assert.equal(await page.getByRole("button", { name: "Accept face offset" }).isEnabled(), true);
  assert.ok(
    (await inspect(page)).preview.bodies[0].faces.find((f) => f.id === hole.id).cylinder.radius > 0,
  );
  await distance.fill("-1");
  await inspect(page);
  close(Number(await (await relativeOffsetInput(page)).inputValue()), -1);
  // Navigation must pass through the widget without applying the edit.
  const before = (await inspect(page)).camera;
  const field = await (await relativeOffsetInput(page)).boundingBox();
  await page.mouse.move(field.x + 10, field.y + 10);
  await page.mouse.wheel(20, 10);
  await inspect(page);
  assert.notDeepEqual((await inspect(page)).camera.target, before.target);
  if (cleanup) {
    await page.waitForFunction(
      () =>
        document.querySelector(".face-offset-widget .commit-cleanup")?.getAttribute("aria-busy") ===
        "false",
    );
    assert.ok(
      await page.getByRole("button", { name: "Commit and clean up", exact: true }).isDisabled(),
    );
  }
  await previewActionReady(page, "Accept face offset");
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  await modalCompleted(page);
  close(
    (await inspect(page)).document.bodies[0].faces.find((f) => f.id === hole.id).cylinder.radius,
    2.5,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await bodyArchiveRoute(page, `${name}-offset`, electron);
  const loaded = (await inspect(page)).document.bodies[0];
  close(loaded.faces.find((f) => f.id === hole.id).cylinder.radius, 2.5);
  // Re-enter a surviving planar face and create a fresh sketch on it.
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "return to modeling", "modeling");
  await worldClick(page, [6, 6, 5]);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("l");
  await drag(page, [4, 4], [8, 4]);
  assert.equal((await inspect(page)).document.sketches.length, 2);
}
async function sharedOffset(page, name) {
  const original = await makePlate(page);
  await orient(page, [0, -0.4, 1]);
  await worldClick(page, [6, 6, 5]);
  await worldClick(page, [6, -10, 2.5], true);
  assert.equal((await inspect(page)).modelingSelection.filter((t) => t.kind === "face").length, 2);
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const input = await relativeOffsetInput(page);
  await input.fill("1");
  const preview = (await inspect(page)).preview;
  close(preview.bodies[0].volume, (420 - Math.PI * 1.5 ** 2) * 6);
  await page.screenshot({ path: `.cache/sketch-review/${name}-shared-offset.png` });
  await page.waitForFunction(
    () =>
      !window.makeshiftInspect().busy &&
      document.querySelector(".face-offset-widget .commit-cleanup")?.getAttribute("aria-busy") ===
        "false",
  );
  await worldClick(page, [-6, 4, 6]);
  let state = await inspect(page);
  assert.equal(state.interaction, null, "Next selection accepts the valid offset");
  close(state.document.bodies[0].volume, (420 - Math.PI * 1.5 ** 2) * 6);
  // Reselect the moved top face: the next edit starts from current geometry.
  await worldClick(page, [6, 6, 6]);
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  await (await relativeOffsetInput(page)).fill("1");
  await inspect(page);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].volume, (420 - Math.PI * 1.5 ** 2) * 7);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}
export async function faceOffsetRoute(page, name, electron, cleanup = false) {
  await planarOffset(page, name);
  await holeOffset(page, name, electron, cleanup);
  await sharedOffset(page, name);
  console.log(
    `${name}: planar push/pull and Ø3→Ø5 hole edit, drag/typing/collapse/recovery, cancel/zero, Undo/Redo/archive/face sketch passed`,
  );
}
