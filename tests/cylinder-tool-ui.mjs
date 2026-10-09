import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

async function extrusion(page) {
  await page.waitForFunction(() => {
    const s = window.makeshiftInspect();
    return !s.busy && s.interaction?.kind === "extrude" && !!s.preview?.bodies?.length;
  });
  return inspect(page);
}

// Integration regression: placement release must consume its click, yield its lease,
// and select the newly accepted circle before starting the editable extrusion.
export async function cylinderPlacementRoute(page) {
  await reset(page);
  await page.getByRole("button", { name: "Top view", exact: true }).locator("polygon").dblclick();
  await settled(page);
  await chooseTool(page, "cylinder", "cylinder");
  assert.equal((await inspect(page)).interaction.kind, "cylinder");
  const a = await project(page, [10, 6, 0]);
  const b = await project(page, [22, 6, 0]);
  await page.mouse.move(a.x, a.y);
  await page.locator(".circular-primitive-dimension:visible").waitFor();
  assert.equal((await inspect(page)).document.sketches.length, 0);
  const label = await page.locator(".circular-primitive-dimension:visible").textContent();
  const diameter = Number(label.split(" ")[1]);
  await page.mouse.click(a.x, a.y);
  const clicked = await extrusion(page);
  close(clicked.document.sketches[0].curves[0].radius, diameter / 2);
  close(clicked.preview.bodies[0].volume, Math.PI * (diameter / 2) ** 2 * diameter);
  await page.getByRole("button", { name: "Cancel extrusion", exact: true }).click();
  await reset(page);
  await page.getByRole("button", { name: "Top view", exact: true }).locator("polygon").dblclick();
  await settled(page);
  await chooseTool(page, "cylinder", "cylinder");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.keyboard.down("Alt");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  let state = await extrusion(page);
  assert.equal(state.document.sketches.length, 1);
  const circle = state.document.sketches[0].curves[0];
  assert.equal(circle.kind, "circle");
  assert.deepEqual(circle.center, { x: 10, y: 6 });
  close(circle.radius, 12);
  assert.equal(state.document.sketches[0].curves.length, 1);
  assert.equal(state.document.bodies?.length ?? 0, 0);
  assert.equal(await page.getByLabel("Symmetric extrusion").isChecked(), false);
  assert.equal(
    await page.getByRole("button", { name: "Union", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  close(state.preview.bodies[0].volume, Math.PI * 12 ** 2 * 24);
  close(state.preview.bodies[0].bounds[2], 0);
  close(state.preview.bodies[0].bounds[5], 24);
  await page.getByLabel("Extrusion distance", { exact: true }).fill("8");
  state = await extrusion(page);
  close(state.preview.bodies[0].volume, Math.PI * 12 ** 2 * 8);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await settled(page);
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await chooseTool(page, "undo", "undo");
  state = await inspect(page);
  assert.equal(state.document.bodies?.length ?? 0, 0);
  assert.equal(state.document.sketches[0].curves[0].kind, "circle");
  await chooseTool(page, "redo", "redo");
  state = await inspect(page);
  const originalBody = state.document.bodies[0];
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].center[0], originalBody.center[0] + 3);
  close(state.document.bodies[0].volume, originalBody.volume);
  assert.equal(state.document.bodies[0].id, originalBody.id);

  await reset(page);
  await chooseTool(page, "cylinder", "cylinder");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  state = await inspect(page);
  assert.equal(state.interaction, null);
  assert.equal(state.document.sketches.length, 0);
}

await withUiRuntimes(
  async (page, name) => {
    await cylinderPlacementRoute(page);
    console.log(
      `${name}: Cylinder pointer handoff, temporary editable extrusion, Undo and cancel passed`,
    );
  },
  { allowed: ["chromium", "webkit", "electron"], timeout: 30000 },
);
