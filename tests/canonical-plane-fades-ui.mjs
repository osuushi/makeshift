import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function orientationCueRoute(page, name = "cue") {
  await reset(page);
  await independentAxesRoute(page, name);
  await orient(page, [0, 0, 1]);
  const canvas = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  const point = { x: canvas.x + canvas.width * 0.84, y: canvas.y + canvas.height * 0.78 };
  await page.mouse.move(point.x, point.y);
  assert.equal((await inspect(page)).planeTargets.find((p) => p.id === "XY").hovered, true);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press("Enter");
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [25, 25], [32, 32]);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
  await chooseTool(page, "return to modeling", "modeling");
  await orient(page, [1, -0.8, 0.3]);
  let state = await inspect(page);
  assert.deepEqual(
    state.planeTargets.filter((p) => p.selectable).map((p) => p.id),
    ["YZ"],
  );
  assert.ok(state.planeTargets.every((p) => p.fillOpacity === 0));
  assert.ok(state.planeTargets.find((p) => p.id === "XZ").opacity > 0);
  assert.ok(state.planeTargets.find((p) => p.id === "XZ").opacity <= 0.22);
  // This ray hits XZ closer than YZ. Ordinary picking must still choose the primary.
  const secondaryPoint = await project(page, [18, 0, -18]);
  await page.mouse.move(secondaryPoint.x, secondaryPoint.y);
  await page.mouse.click(secondaryPoint.x, secondaryPoint.y);
  assert.equal((await inspect(page)).planeTargets.find((p) => p.id === "XZ").selected, false);
  assert.equal((await inspect(page)).planeTargets.find((p) => p.id === "YZ").selected, true);
  await distantPanRoute(page, point);
  await reset(page);
  const fixture = JSON.parse(await readFile("tests/fixtures/plane-cut-bent-shell.json", "utf8"));
  await openDocument(page, {
    name: "cue-split.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await orient(page, [1, -0.8, 0.3]);
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "Split Body", "split");
  state = await inspect(page);
  assert.equal(state.planeTargets.find((p) => p.id === "XZ").selectable, true);
  // Exposed XZ patch on the camera side of YZ; no DOM widget or injected picker.
  const exposed = await project(page, [30, 0, -18]);
  await page.mouse.move(exposed.x, exposed.y);
  await page.mouse.click(exposed.x, exposed.y);
  state = await inspect(page);
  assert.ok(state.preview?.bodies.length >= 2, state.notice);
  await page.getByText("Cutter · XZ world plane", { exact: true }).waitFor();
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Escape");
  const history = await page.evaluate(() => window.makeshiftHistory());
  assert.deepEqual(history.at(-1).operation.parameters.operation.frame, {
    origin: [0, 0, 0],
    u: [1, 0, 0],
    v: [0, 0, 1],
  });
  assert.deepEqual((await inspect(page)).document, original);
}

if (process.argv[1]?.endsWith("canonical-plane-fades-ui.mjs")) {
  await withUiRuntimes(
    async (page, name) => {
      await orientationCueRoute(page, name);
      console.log(
        `${name}: primary canvas sketch entry, secondary click gating, real secondary split/cancel passed`,
      );
    },
    { defaults: ["chromium", "webkit"] },
  );
}

async function distantPanRoute(page, point) {
  await orient(page, [1, 1, 1]);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(2000000, 1000000);
  await page.waitForFunction(() => Math.hypot(...window.makeshiftInspect().camera.target) > 50000);
  await settled(page);
  const state = await inspect(page);
  assert.equal(state.planeTargets.filter((p) => p.visible).length, 2);
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
  // Present the retained canvas before reading pixels in on-demand CI mode.
  await page.screenshot({ path: `.cache/sketch-review/${name}-independent-world-axes.png` });
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
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("button", { name: "Reset grid display" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}
