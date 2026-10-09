import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted, reset, settled } from "./ui-helpers.mjs";
import { orientWithTurntable } from "./ui-orbit-orient.mjs";
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
async function drillRoute(page, name) {
  await reset(page);
  await top(page);
  await chooseTool(page, "drill", "drill");
  const empty = await project(page, [0, 0, 0]);
  await page.mouse.click(empty.x, empty.y);
  assert.equal((await inspect(page)).document.sketches.length, 0);
  assert.equal((await inspect(page)).interaction.kind, "drill");
  await page.keyboard.press("Escape");
  await draw(page, "cube", [0, 0, 0], [40, 40, 0]);
  await accept(page);
  let state = await draw(page, "drill", [20, 20, 40], [26, 20, 40]);
  const distance = Number(
    await page.getByLabel("Extrusion distance", { exact: true }).inputValue(),
  );
  close(distance, -40); // Unfocused fields display four significant digits.
  assert.equal(await page.getByLabel("Symmetric extrusion").isChecked(), false);
  assert.equal(
    await page.getByRole("button", { name: "Subtract", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  close(state.preview.bodies[0].volume, 64000 - Math.PI * 36 * 40);
  await page.getByLabel("Extrusion distance", { exact: true }).fill("-20");
  state = await preview(page);
  close(state.preview.bodies[0].volume, 64000 - Math.PI * 36 * 20);
  await page.getByLabel("Extrusion distance", { exact: true }).fill("-40.00001");
  await preview(page);
  state = await accept(page);
  close(state.document.bodies[0].volume, 64000 - Math.PI * 36 * 40);
  await page.screenshot({ path: `.cache/sketch-review/${name}-drill.png` });
  await chooseTool(page, "undo", "undo");
  close((await inspect(page)).document.bodies[0].volume, 64000);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies[0].volume, state.document.bodies[0].volume);
  // Drill a second hole inward from the opposite face to verify the face-normal sign.
  await orientWithTurntable(page, [0.1, -0.1, -1]);
  await page
    .getByRole("button", { name: "Bottom view", exact: true })
    .locator("polygon")
    .dblclick();
  await settled(page);
  state = await draw(page, "drill", [10, 10, 0], [14, 10, 0]);
  close(state.preview.bodies[0].volume, 64000 - Math.PI * (36 + 16) * 40);
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  close((await inspect(page)).document.bodies[0].volume, 64000 - Math.PI * 36 * 40);
}

await withUiRuntimes(
  async (page, name) => {
    await coneRoute(page, name);
    await drillRoute(page, name);
    console.log(
      `${name}: Cone exact apex and Drill through-body editable handoff, Enter, cancel and history passed`,
    );
  },
  { allowed: ["chromium", "webkit", "electron"], timeout: 30000 },
);
