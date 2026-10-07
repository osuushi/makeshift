import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reset(page);
    await independentAxesRoute(page, name);
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
    const state = await inspect(page);
    assert.deepEqual(
      state.planeTargets.filter((p) => p.selectable).map((p) => p.id),
      ["YZ"],
    );
    assert.ok(state.planeTargets.every((p) => p.fillOpacity === 0));
    await orient(page, [0.2, 1, 0.2]);
    await settled(page);
    assert.deepEqual(
      (await inspect(page)).planeTargets.filter((p) => p.visible).map((p) => p.id),
      ["XZ"],
    );
    await orient(page, [0.2, 0.2, 1]);
    await settled(page);
    assert.deepEqual(
      (await inspect(page)).planeTargets.filter((p) => p.visible).map((p) => p.id),
      ["XY"],
    );
    await distantPanRoute(page, point);
    console.log(
      `${name}: full-view canvas entry, real sketch, focused grid visibility and no plane fills passed`,
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
  assert.equal(state.planeTargets.filter((p) => p.visible).length, 1);
  assert.equal(state.planeTargets.filter((p) => p.selectable).length, 1);
  await page.mouse.move(point.x + 1, point.y + 1);
  assert.ok(
    (await inspect(page)).planeTargets.some((p) => p.hovered),
    "Oblique references remain reachable with the origin far offscreen",
  );
  await page.mouse.click(point.x + 1, point.y + 1);
  assert.ok((await inspect(page)).planeTargets.some((p) => p.selected));
}

async function independentAxesRoute(page, name) {
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("slider", { name: "Grid opacity", exact: true }).press("Home");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await settled(page);
  assert.ok((await inspect(page)).planeTargets.every((p) => !p.selectable));
  const counts = await page.evaluate(async () => {
    const source = document.querySelector("canvas");
    const image = new Image();
    image.src = source.toDataURL();
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = { X: 0, Y: 0, Z: 0 };
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = pixels.slice(i, i + 3);
      if (r > g + 15 && r > b + 10) counts.X++;
      if (g > r + 10 && g > b + 10) counts.Y++;
      if (b > r + 15 && b > g + 10) counts.Z++;
    }
    return counts;
  });
  for (const [axis, count] of Object.entries(counts))
    assert.ok(count > 20, `${axis} world axis renders with grids hidden (${count} colored pixels)`);
  await page.screenshot({ path: `.cache/sketch-review/${name}-independent-world-axes.png` });
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("button", { name: "Reset grid display" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}
