import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} != ${b}`);
async function top(page) {
  await page.getByRole("button", { name: "Top view", exact: true }).locator("polygon").dblclick();
  await settled(page);
}
async function draw(page, tool, center, tip) {
  await chooseTool(page, tool, tool);
  const a = await project(page, center),
    b = await project(page, tip);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  return preview(page);
}
async function preview(page) {
  await page.waitForFunction(() => {
    const s = window.makeshiftInspect();
    return !s.busy && s.interaction?.kind === "extrude" && !!s.preview?.bodies?.length;
  });
  return inspect(page);
}
async function accept(page) {
  await page.getByLabel("Modeling viewport").focus();
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  return inspect(page);
}
async function coneRoute(page, name) {
  await reset(page);
  await top(page);
  let state = await draw(page, "cone", [0, 0, 0], [10, 0, 0]);
  close(state.preview.bodies[0].volume, (Math.PI * 100 * 20) / 3);
  assert.equal(state.preview.bodies[0].faces.length, 2);
  assert.equal(await page.getByLabel("Draft measurement").inputValue(), "offset");
  close(Number(await page.getByLabel("Draft value").inputValue()), -10);
  await page.getByLabel("Extrusion distance", { exact: true }).fill("30");
  state = await preview(page);
  close(state.preview.bodies[0].volume, (Math.PI * 100 * 30) / 3);
  await page.screenshot({ path: `.cache/sketch-review/${name}-cone.png` });
  const accepted = await accept(page);
  assert.equal(accepted.document.bodies.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies[0].volume, accepted.document.bodies[0].volume);
  await reset(page);
  await top(page);
  await chooseTool(page, "cone", "cone");
  const a = await project(page, [0, 0, 0]),
    b = await project(page, [10, 0, 0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.keyboard.down("Alt");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  state = await preview(page);
  close(state.preview.bodies[0].volume, (Math.PI * 100 * 20) / 3);
  close(state.preview.bodies[0].bounds[2], 0);
  close(state.preview.bodies[0].bounds[5], 20);
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
}
await withUiRuntimes(
  async (page, name) => {
    await coneRoute(page, name);
    console.log(`${name}: Cone exact apex editable handoff, Enter, cancel and history passed`);
  },
  { allowed: ["chromium", "webkit", "electron"], timeout: 30000 },
);
