import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reset(page);
    await orient(page, [0, 0, 1]);
    const canvas = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
    // Far outside the former +/-20 mm origin patch, through the actual canvas.
    const point = { x: canvas.x + canvas.width * 0.84, y: canvas.y + canvas.height * 0.78 };
    await page.mouse.move(point.x, point.y);
    assert.equal((await inspect(page)).planeTargets.find((p) => p.id === "XY").hovered, true);
    await page.mouse.click(point.x, point.y);
    assert.equal((await inspect(page)).planeTargets.find((p) => p.id === "XY").selected, true);
    await page.keyboard.press("Enter");
    await chooseTool(page, "rectangle", "rectangle");
    await drag(page, [25, 25], [32, 32]);
    assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
    await chooseTool(page, "return to modeling", "modeling");
    await orient(page, [0.9, 0.4, Math.sqrt(0.03)]);
    let state = await inspect(page);
    assert.deepEqual(
      state.planeTargets.filter((p) => p.selectable).map((p) => p.id),
      ["YZ"],
    );
    await page.getByRole("button", { name: "Application settings" }).click();
    await page.getByRole("combobox", { name: "Plane visibility preset" }).selectOption("choice");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await settled(page);
    state = await inspect(page);
    assert.deepEqual(
      state.planeTargets.filter((p) => p.selectable).map((p) => p.id),
      ["XZ", "YZ"],
    );
    await page.getByRole("button", { name: "Application settings" }).click();
    await page.getByRole("button", { name: "Reset plane visibility" }).click();
    await page
      .getByRole("slider", { name: "Minimum selectable visibility", exact: true })
      .press("End");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await orient(page, [1, 1, 1]);
    state = await inspect(page);
    assert.ok(
      state.planeTargets.every((p) => p.visible && !p.selectable),
      "Preview is visible before selectable",
    );
    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y);
    assert.ok((await inspect(page)).planeTargets.every((p) => !p.hovered && !p.selected));
    await page.getByRole("button", { name: "Application settings" }).click();
    await page
      .getByRole("slider", { name: "Maximum preview visibility", exact: true })
      .press("Home");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await settled(page);
    state = await inspect(page);
    assert.ok(
      state.planeTargets.every((p) => p.opacity === 1 && p.selectable),
      "Optional preview jump reaches selectable maximum",
    );
    await page.getByRole("button", { name: "Application settings" }).click();
    await page.getByRole("button", { name: "Reset plane visibility" }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await distantPanRoute(page, point);
    console.log(
      `${name}: full-view canvas entry, real sketch, preset counts, faint previews and jump threshold passed`,
    );
  },
  { defaults: ["chromium", "webkit"] },
);

async function distantPanRoute(page, point) {
  await orient(page, [1, 1, 1]);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(2000000, 1000000);
  await page.waitForFunction(() => Math.hypot(...window.makeshiftInspect().camera.target) > 50000);
  await settled(page);
  const state = await inspect(page);
  assert.ok(state.planeTargets.every((p) => p.selectable));
  await page.mouse.move(point.x + 1, point.y + 1);
  assert.ok(
    (await inspect(page)).planeTargets.some((p) => p.hovered),
    "Oblique references remain reachable with the origin far offscreen",
  );
  await page.mouse.click(point.x + 1, point.y + 1);
  assert.ok((await inspect(page)).planeTargets.some((p) => p.selected));
}
