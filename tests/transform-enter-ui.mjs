import assert from "node:assert/strict";
import * as THREE from "three";
import { project } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const viewport = (page) => page.getByLabel("Modeling viewport", { exact: true });
async function commandIdle(page) {
  await page.waitForFunction(
    () =>
      !window
        .makeshiftInspect()
        .commands.some((command) => command.unavailable === "Switching tools…"),
  );
}
async function idleEnter(page, key = "Enter") {
  await viewport(page).focus();
  await page.keyboard.press(key);
  await commandIdle(page);
  return inspect(page);
}
async function moveX(page, value) {
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  return (await inspect(page)).document;
}
async function history(page, before, after) {
  await chooseTool(page, "undo", "undo");
  await commandIdle(page);
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  await commandIdle(page);
  assert.deepEqual((await inspect(page)).document, after);
}
async function createBody(page) {
  await chooseTool(page, "new document", "new");
  await page.waitForFunction(
    () =>
      !window
        .makeshiftInspect()
        .commands.some((command) => command.unavailable === "Switching tools…") ||
      !!document.querySelector('dialog[aria-label="Unsaved changes"][open]'),
  );
  const discard = page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Don’t Save", exact: true });
  if (await discard.isVisible()) await discard.click();
  await commandIdle(page);
  assert.deepEqual((await inspect(page)).document.sketches, []);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [-10, -5], [10, 5]);
  const drawn = await inspect(page);
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  const height = page.getByRole("textbox", { name: "Height", exact: true });
  if (process.env.MAKESHIFT_TRANSFORM_ENTER_DIAGNOSTICS)
    console.log("Transform fixture rectangle", {
      width: await width.inputValue(),
      height: await height.inputValue(),
      curves: drawn.document.sketches[0].curves.map((curve) => [curve.a, curve.b]),
    });
  await width.fill("20");
  await page.keyboard.press("Enter");
  await inspect(page);
  await height.fill("10");
  await page.keyboard.press("Enter");
  const rectangle = (await inspect(page)).document.sketches[0];
  const coordinates = rectangle.curves.flatMap((curve) => [curve.a, curve.b]);
  close(
    Math.max(...coordinates.map((point) => point.x)) -
      Math.min(...coordinates.map((point) => point.x)),
    20,
    "Accepted rectangle width",
  );
  close(
    Math.max(...coordinates.map((point) => point.y)) -
      Math.min(...coordinates.map((point) => point.y)),
    10,
    "Accepted rectangle height",
  );
  const point = await at(page, 3, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await commandIdle(page);
  await page.mouse.click(point.x, point.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("10");
  await inspect(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  const document = (await inspect(page)).document;
  close(document.bodies[0].volume, 2000);
  return document;
}
async function restoreFromOffset(page) {
  await chooseTool(page, "offset faces", "offset");
  await commandIdle(page);
  const before = await inspect(page);
  assert.equal(before.modelingTool, "offset");
  assert.equal(before.interaction, null, "Enter alias is tested while idle");
  const after = await idleEnter(page);
  assert.equal(after.modelingTool, "move");
  assert.equal(after.interaction, null, "Alias only exposes existing Transform controls");
  assert.deepEqual(after.document, before.document);
  assert.deepEqual(after.modelingSelection, before.modelingSelection);
  assert.equal(
    await page.getByRole("button", { name: "Move body X", exact: true }).isVisible(),
    true,
  );
}
async function singleAndMultiple(page, name) {
  const original = await createBody(page);
  const bodyPoint = await project(page, [4, 2, 10]);
  await page.mouse.dblclick(bodyPoint.x, bodyPoint.y);
  assert.deepEqual((await inspect(page)).modelingSelection, [
    { kind: "body", body: original.bodies[0].id },
  ]);
  await restoreFromOffset(page);
  const moved = await moveX(page, 3);
  close(moved.bodies[0].center[0], original.bodies[0].center[0] + 3);
  close(moved.bodies[0].volume, 2000);
  await history(page, original, moved);
  await chooseTool(page, "duplicate bodies", "duplicate");
  const pair = await moveX(page, 30);
  assert.equal(pair.bodies.length, 2);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Body 2", exact: true })
    .click({ modifiers: ["Shift"] });
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await restoreFromOffset(page);
  const shifted = await moveX(page, 2);
  for (let index = 0; index < 2; index++) {
    close(shifted.bodies[index].center[0], pair.bodies[index].center[0] + 2);
    close(shifted.bodies[index].volume, 2000);
  }
  await history(page, pair, shifted);
  // Numeric scale Enter belongs to its modal controller, never the idle alias.
  await page.locator(".transform-box-handle:visible").last().click();
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
  assert.equal((await inspect(page)).interaction.kind, "scale");
  await page.keyboard.press("Enter");
  const scaled = (await inspect(page)).document;
  for (const body of scaled.bodies) close(body.volume, 2000 * 1.5 ** 3);
  await history(page, shifted, scaled);
  await viewport(page).focus();
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, scaled);
  assert.equal((await inspect(page)).modelingSelection.length, 0);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await restoreFromOffset(page);
  console.log(
    `${name}: body double-click and single/multi other-mode Enter; Move/scale numeric acceptance, exit and Undo/Redo passed`,
  );
}
async function modelClick(page, point) {
  const { camera } = await inspect(page);
  const box = await viewport(page).boundingBox();
  const height = camera.height / 2,
    width = (height * box.width) / box.height;
  const view = new THREE.OrthographicCamera(-width, width, height, -height, 0.1, 10000);
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  view.updateMatrixWorld();
  const projected = new THREE.Vector3(...point).project(view);
  await page.mouse.click(
    box.x + ((projected.x + 1) * box.width) / 2,
    box.y + ((1 - projected.y) * box.height) / 2,
  );
}
function topFacePoint(body) {
  const face = body.faces.find((face) => {
    const plane = face.plane;
    return plane && plane.u[0] * plane.v[1] - plane.u[1] * plane.v[0] > 0.99;
  });
  assert.ok(face?.plane, "Accepted body retains an upward planar face");
  assert.ok(face.vertices.length >= 9);
  return [0, 1, 2].map(
    (axis) => (face.vertices[axis] + face.vertices[axis + 3] + face.vertices[axis + 6]) / 3,
  );
}
async function nativeSelectGuard(page, document) {
  const body = document.bodies[0];
  await modelClick(page, topFacePoint(body));
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await chooseTool(page, "offset faces", "offset");
  await commandIdle(page);
  const mode = page.getByRole("combobox", { name: "Offset mode", exact: true });
  assert.equal(await mode.isEnabled(), true, "Planar face exposes thickness and offset choices");
  await mode.focus();
  assert.equal(await mode.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).modelingTool, "offset", "Native select retains Enter");
  assert.deepEqual((await inspect(page)).document, document);
  await page.keyboard.press("Escape");
}
async function nativeFocusAndModal(page, name) {
  await chooseTool(page, "offset faces", "offset");
  await commandIdle(page);
  const before = await inspect(page);
  await idleEnter(page, "Shift+Enter");
  assert.equal((await inspect(page)).modelingTool, "offset");
  await nativeSelectGuard(page, before.document);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "offset faces", "offset");
  await commandIdle(page);
  await viewport(page).focus();
  const tools = page.getByRole("button", { name: "Tools", exact: true });
  await tools.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.getByRole("dialog", { name: "Find a tool" }).isVisible(),
    true,
    "Native Tools button retains Enter",
  );
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).modelingTool, "offset");
  assert.deepEqual((await inspect(page)).document, before.document);
  if (name === "electron") {
    await page.evaluate(() =>
      window.makeshiftAgent.request({
        kind: "configure",
        preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
      }),
    );
    await page.getByRole("button", { name: "Open agent terminal", exact: true }).click();
    await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
    await page.locator(".agent-screen textarea").focus();
    await page.keyboard.type(":");
    await page.keyboard.press("Enter");
    assert.equal(
      (await inspect(page)).modelingTool,
      "offset",
      "Owned terminal Enter cannot activate body Transform",
    );
    assert.deepEqual((await inspect(page)).document, before.document);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector(".agent-dock [data-stop]")?.disabled &&
        !document.querySelector(".agent-dock [data-start]")?.disabled,
    );
    assert.equal(
      (await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }))).running,
      false,
      "Stop drains the owned terminal process",
    );
    assert.match(await page.locator(".agent-status").textContent(), /^(Stopped|Exited -?\d+)$/);
    await page.getByRole("button", { name: "Collapse agent terminal", exact: true }).click();
  }
  await idleEnter(page);
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("9");
  await inspect(page);
  await viewport(page).focus();
  await page.keyboard.press("Escape");
  assert.deepEqual(
    (await inspect(page)).document,
    before.document,
    "Modal cancel remains unchanged",
  );
  console.log(
    `${name}: modified Enter, native controls, numeric modal cancel${name === "electron" ? " and host agent terminal" : ""} passed`,
  );
}
async function workspaceEnter(page, name) {
  await page.keyboard.press("Escape");
  const document = (await inspect(page)).document;
  const body = document.bodies[0];
  await modelClick(page, topFacePoint(body));
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  const onFace = await idleEnter(page);
  assert.equal(onFace.activePlane, "Face sketch");
  assert.deepEqual(onFace.document, document);
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  const onSketch = await idleEnter(page);
  assert.equal(onSketch.activeSketch, document.sketches[0].id);
  assert.deepEqual(onSketch.document, document);
  console.log(`${name}: selected planar-face/sketch Enter retains workspace entry`);
}
await withUiRuntimes(async (page, name) => {
  await singleAndMultiple(page, name);
  await nativeFocusAndModal(page, name);
  await workspaceEnter(page, name);
});
