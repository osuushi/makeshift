import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);

async function sphere(page, drag) {
  await chooseTool(page, "sphere", "sphere");
  const center = await project(page, [5, 3, 0]);
  if (drag) {
    const tip = await project(page, [15, 3, 0]);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(tip.x, tip.y, { steps: 5 });
    await page.mouse.up();
  } else await page.mouse.click(center.x, center.y);
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return !state.busy && state.interaction?.kind === "revolve" && !!state.preview?.bodies?.length;
  });
  return inspect(page);
}

// Placement must yield its captured interaction before Revolve begins. Native
// volume tests cannot catch a retained lease, lost release, or missing Enter handoff.
await withUiRuntimes(
  async (page) => {
    await reset(page);
    await page.getByRole("button", { name: "Top view", exact: true }).locator("polygon").dblclick();
    await settled(page);
    let state = await sphere(page, true);
    const [circle, diameter] = state.document.sketches[0].curves;
    assert.equal(circle.kind, "circle");
    assert.equal(diameter.kind, "segment");
    assert.equal(diameter.construction, false);
    near((diameter.a.x + diameter.b.x) / 2, circle.center.x);
    near((diameter.a.y + diameter.b.y) / 2, circle.center.y);
    near(Math.hypot(diameter.a.x - diameter.b.x, diameter.a.y - diameter.b.y), 2 * circle.radius);
    const volume = (4 * Math.PI * circle.radius ** 3) / 3;
    near(state.preview.bodies[0].volume, volume);
    assert.equal(state.modelingSelection.length, 1);
    assert.equal(state.modelingSelection[0].kind, "profile");
    assert.equal(await page.getByLabel("Revolution angle", { exact: true }).inputValue(), "360");
    assert.equal(await page.getByLabel("Revolution height", { exact: true }).inputValue(), "0");
    assert.equal(
      await page.getByRole("button", { name: "Union", exact: true }).getAttribute("aria-pressed"),
      "true",
    );
    await page.getByLabel("Revolution angle", { exact: true }).fill("180");
    await settled(page);
    near((await inspect(page)).preview.bodies[0].volume, volume / 2);
    await page.getByLabel("Revolution angle", { exact: true }).fill("360");
    await settled(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    state = await inspect(page);
    near(state.document.bodies[0].volume, volume);
    await chooseTool(page, "undo", "undo");
    state = await inspect(page);
    assert.equal(state.document.bodies?.length ?? 0, 0);
    assert.equal(state.document.sketches.length, 1);
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.sketches.length, 0);
    state = await sphere(page, false);
    assert.ok(state.preview.bodies[0].volume > 0);
    await page.getByRole("button", { name: "Change revolution axis", exact: true }).click();
    assert.match(await page.locator(".status").textContent(), /Choose a straight edge/);
    await page.keyboard.press("Escape");
    state = await inspect(page);
    assert.equal(state.document.bodies?.length ?? 0, 0);
    assert.equal(state.document.sketches.length, 1);
    console.log(
      "Sphere pointer placement, half-region, editable Revolve, Enter, Undo and cancel passed",
    );
  },
  { allowed: ["chromium", "webkit", "electron"], timeout: 30000 },
);
