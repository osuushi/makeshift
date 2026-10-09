import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

async function top(page) {
  await page.getByRole("button", { name: "Top view", exact: true }).locator("polygon").dblclick();
  await settled(page);
}
async function extrusion(page) {
  await page.waitForFunction(() => {
    const s = window.makeshiftInspect();
    return !s.busy && s.interaction?.kind === "extrude" && !!s.preview?.bodies?.length;
  });
  return inspect(page);
}
async function begin(page) {
  await chooseTool(page, "cube", "cube");
  assert.equal((await inspect(page)).interaction.kind, "cube");
}
async function clickOff(page) {
  const box = await page.getByLabel("Modeling viewport").boundingBox();
  await page.mouse.click(box.x + 30, box.y + box.height - 30);
  await page.waitForFunction(() => !window.makeshiftInspect().interaction);
  return inspect(page);
}
async function draw(page, center, tip) {
  const a = await project(page, center),
    b = await project(page, tip);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  return extrusion(page);
}

async function clickCube(page, name) {
  await reset(page);
  await top(page);
  await begin(page);
  const center = await project(page, [15, 10, 0]);
  await page.mouse.move(center.x, center.y);
  const labels = page.locator(".cube-dimension:visible");
  await labels.first().waitFor();
  await page.screenshot({ path: `.cache/sketch-review/${name}-cube-placement.png` });
  const size = Number((await labels.first().textContent()).split(" ")[0]);
  assert.ok(size > 0);
  const beforeZoom = (await inspect(page)).camera.height;
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 450);
  await page.keyboard.up("Control");
  await settled(page);
  const afterZoom = (await inspect(page)).camera.height;
  assert.notEqual(afterZoom, beforeZoom);
  const zoomSize = Number((await labels.first().textContent()).split(" ")[0]);
  assert.notEqual(zoomSize, size, "Idle square recomputes on zoom");
  await page.mouse.click(center.x, center.y);
  let state = await extrusion(page);
  assert.match(await page.locator(".status").textContent(), /Extrude/);
  assert.equal(state.document.sketches.length, 1);
  assert.equal(state.document.sketches[0].curves.length, 4);
  assert.equal(state.document.sketches[0].groups[0].kind, "rectangle");
  assert.equal(state.document.bodies?.length ?? 0, 0, "Cube hands off to temporary Extrude");
  assert.equal(await page.getByLabel("Symmetric extrusion").isChecked(), true);
  close(state.preview.bodies[0].volume, zoomSize ** 3);
  close(state.preview.bodies[0].bounds[2], -zoomSize / 2);
  close(
    Number(await page.getByLabel("Extrusion distance", { exact: true }).inputValue()),
    zoomSize,
  );
  state = await clickOff(page);
  assert.equal(state.document.bodies.length, 1);
  assert.equal(await page.getByRole("button", { name: "Show Sketch 1", exact: true }).count(), 1);
  const accepted = state.document;
  await chooseTool(page, "undo", "undo");
  state = await inspect(page);
  assert.equal(state.document.bodies?.length ?? 0, 0);
  assert.equal(state.document.sketches.length, 1);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  const file = resolve(".cache/sketch-review/cube-tool.makeshift");
  await saveDocument(page, file);
  await reset(page);
  await openDocument(page, file);
  const reopened = (await inspect(page)).document;
  assert.deepEqual(reopened.sketches, accepted.sketches);
  assert.equal(reopened.bodies[0].id, accepted.bodies[0].id);
  close(reopened.bodies[0].volume, accepted.bodies[0].volume);
  reopened.bodies[0].bounds.forEach((value, i) => {
    close(value, accepted.bodies[0].bounds[i]);
  });
  assert.deepEqual(
    reopened.bodies[0].faces.map((face) => face.id),
    accepted.bodies[0].faces.map((face) => face.id),
  );
}

async function rectangleAndEdit(page) {
  await reset(page);
  await top(page);
  await begin(page);
  let state = await draw(page, [10, 6, 0], [22, 14, 0]);
  const body = state.preview.bodies[0];
  close(body.bounds[0], -2);
  close(body.bounds[1], -2);
  close(body.bounds[3], 22);
  close(body.bounds[4], 14);
  close(body.bounds[2], -8);
  close(body.bounds[5], 8);
  close(body.volume, 24 * 16 * 16);
  await page.getByLabel("Extrusion distance", { exact: true }).fill("8");
  state = await extrusion(page);
  close(state.preview.bodies[0].volume, 24 * 16 * 8);
  const arrow = page.getByRole("button", { name: "Drag extrusion", exact: true });
  const box = await arrow.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 35, { steps: 4 });
  await page.mouse.up();
  state = await extrusion(page);
  assert.equal(await page.getByLabel("Symmetric extrusion").isChecked(), true);
  assert.notEqual(state.preview.bodies[0].volume, 24 * 16 * 8);
  await page.getByRole("button", { name: "Cancel extrusion", exact: true }).click();
  state = await inspect(page);
  assert.equal(state.document.bodies?.length ?? 0, 0);
  assert.equal(state.document.sketches.length, 1, "Cancel leaves ordinary source sketch");
  const pick = await project(page, [10, 6, 0]);
  await page.mouse.click(pick.x, pick.y);
  await chooseTool(page, "edit sketch", "edit-sketch");
  await settled(page);
  await page.keyboard.press("v");
  const corner = await project(page, [-2, -2, 0]);
  await page.mouse.click(corner.x, corner.y);
  assert.ok((await inspect(page)).selection.length, "Source remains editable");
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("30");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  const xs = state.document.sketches[0].curves.flatMap((c) => [c.a.x, c.b.x]);
  close(Math.max(...xs) - Math.min(...xs), 30);
}

async function squareAndCancel(page) {
  await reset(page);
  await top(page);
  await begin(page);
  const a = await project(page, [0, 0, 0]),
    b = await project(page, [12, 8, 0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, a.y, { steps: 4 });
  await page.mouse.up();
  assert.equal((await inspect(page)).interaction.kind, "cube");
  assert.equal((await inspect(page)).document.sketches.length, 0);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.keyboard.down("Shift");
  const labels = page.locator(".cube-dimension:visible");
  assert.deepEqual(await labels.allTextContents(), ["24 mm", "24 mm"]);
  await page.keyboard.up("Shift");
  assert.deepEqual(await labels.allTextContents(), ["24 mm", "16 mm"]);
  await page.keyboard.down("Shift");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  let state = await extrusion(page);
  close(state.preview.bodies[0].volume, 24 ** 3);
  assert.match(await page.locator(".status").textContent(), /Extrude/);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await settled(page);

  await reset(page);
  await begin(page);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).interaction, null);
  await begin(page);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 20, a.y + 15);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  state = await inspect(page);
  assert.equal(state.interaction, null);
  assert.equal(state.document.sketches.length, 0);
  await begin(page);
  await page.getByRole("button", { name: "Front view", exact: true }).locator("polygon").dblclick();
  await settled(page);
  const front = await project(page, [10, 0, 10]);
  await page.mouse.click(front.x, front.y);
  state = await extrusion(page);
  assert.deepEqual(state.document.sketches[0].plane.u, [1, 0, 0]);
  assert.deepEqual(state.document.sketches[0].plane.v, [0, 0, 1]);
  const body = state.preview.bodies[0];
  close(body.bounds[1], -body.bounds[4]);
  await page.getByRole("button", { name: "Cancel extrusion", exact: true }).click();
}

await withUiRuntimes(
  async (page, name) => {
    await clickCube(page, name);
    await rectangleAndEdit(page);
    await squareAndCancel(page);
    console.log(
      `${name}: Cube click/zoom, centered rectangle, Shift, editable Extrude/source, click-off, cancel, history and primary-plane changes passed`,
    );
  },
  { allowed: ["chromium", "webkit", "electron"], timeout: 30000 },
);
