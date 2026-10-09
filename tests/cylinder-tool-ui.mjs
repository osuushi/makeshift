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
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.keyboard.down("Alt");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  let state = await extrusion(page);
  assert.equal(state.document.sketches.length, 1);
  const circle = state.document.sketches[0].curves[0];
  assert.equal(circle.kind, "circle");
  close(circle.radius, 12);
  assert.equal(state.document.sketches[0].curves.length, 1);
  assert.equal(state.document.bodies?.length ?? 0, 0);
  assert.equal(await page.getByLabel("Symmetric extrusion").isChecked(), true);
  assert.equal(
    await page.getByRole("button", { name: "Union", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  close(state.preview.bodies[0].volume, Math.PI * 12 ** 2 * 24);
  close(state.preview.bodies[0].bounds[2], -12);
  close(state.preview.bodies[0].bounds[5], 12);
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
  { allowed: ["electron"], timeout: 30000 },
);
