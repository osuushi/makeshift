import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseWidget } from "./ui-modal-plane-widgets.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function sample(page, point) {
  const p = await project(page, point);
  // Sample a flat, interior surface away from edges, holes and gizmos.
  const result = await page.screenshot({
    clip: { x: Math.round(p.x) - 14, y: Math.round(p.y) - 14, width: 28, height: 28 },
  });
  return page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 28;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, 28, 28).data;
    return Array.from(pixels);
  }, result.toString("base64"));
}

async function route(page, name) {
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await makePlate(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [6, -6, 5]);
  const original = (await inspect(page)).document;
  for (const [i, direction] of [
    [1, -1, 1],
    [0.4, -1, 0.7],
    [1, -0.3, 0.6],
  ].entries()) {
    await orient(page, direction);
    await page.mouse.move(1100, 80);
    await page.screenshot({ path: `.cache/section-depth/${name}-${i}-off.png` });
    const before = await sample(page, [-6, -6, 5]);
    await chooseTool(page, "cross section", "cross-section");
    await page.waitForFunction(
      () =>
        !window.makeshiftInspect().sectionCalculating &&
        window.makeshiftInspect().sectionSurfaces > 0,
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.mouse.move(1100, 80);
    await page.screenshot({ path: `.cache/section-depth/${name}-${i}.png` });
    const after = await sample(page, [-6, -6, 5]);
    const delta = Math.max(...after.map((n, j) => Math.abs(n - before[j])));
    console.log(name, i, "section-only RGB delta", delta);
    assert.ok(delta <= 1, `Section must not repaint an existing coplanar face: ${delta}`);
    await page.getByRole("button", { name: "Turn off section", exact: true }).click();
  }
  await coplanarSketch(page, name);
  assert.deepEqual((await inspect(page)).document, original);
  assert.deepEqual(errors, []);
}
async function coplanarSketch(page, name) {
  await chooseTool(page, "clear selection", "selection-clear");
  await orient(page, [1, -1, -1]);
  await page.mouse.move(1100, 80);
  await page.screenshot({ path: `.cache/section-depth/${name}-coplanar-before.png` });
  const before = await sample(page, [-6, -6, 0]);
  await chooseTool(page, "cross section", "cross-section");
  // Pick explicitly without the helper's orbit, preserving baseline pixel positions.
  await chooseWidget(page, "XY");
  await page.waitForFunction(
    () =>
      !window.makeshiftInspect().sectionCalculating &&
      window.makeshiftInspect().sectionSurfaces > 0,
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  for (let flip = 0; flip < 2; flip++) {
    await page.mouse.move(1100, 80);
    await page.screenshot({ path: `.cache/section-depth/${name}-coplanar-after.png` });
    const after = await sample(page, [-6, -6, 0]);
    const delta = Math.max(...after.map((n, j) => Math.abs(n - before[j])));
    console.log(name, "coplanar sketch", flip, "RGB delta", delta);
    assert.ok(delta <= 1, `Section must preserve coplanar sketch/face pixels: ${delta}`);
    await page.getByRole("button", { name: "Flip side", exact: true }).click();
    await page.waitForFunction(() => !window.makeshiftInspect().sectionCalculating);
  }
  await page.screenshot({ path: `.cache/section-depth/${name}-sketch.png` });
}
await mkdir(".cache/section-depth", { recursive: true });
const names = runtimeNames(["chromium", "webkit", "electron"]);
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([name]) =>
    names.includes(name),
  )) {
    if (process.env.MAKESHIFT_TEST_BROWSER && process.env.MAKESHIFT_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await route(page, name);
    } finally {
      await browser.close();
    }
  }
  if (!process.env.MAKESHIFT_TEST_BROWSER || process.env.MAKESHIFT_TEST_BROWSER === "electron") {
    const app = await launchElectron({
      args: ["."],
      env: {
        ...process.env,
        MAKESHIFT_TEST_HIDDEN: "1",
        MAKESHIFT_DEV_URL: server.resolvedUrls.local[0],
      },
    });
    try {
      const page = await app.firstWindow();
      assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
        false,
      );
      await route(page, "electron");
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
