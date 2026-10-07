import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { orient } from "../../../../tests/ui-blend-edit.mjs";
import { at, drag, inspect, reset, settled } from "../../../../tests/ui-helpers.mjs";
import { chooseTool } from "../../../../tests/ui-tools.mjs";
import { FixedStepCapture } from "./fixed-step-capture.mjs";
import { label, overlays } from "./overlays.mjs";

const output = path.resolve(process.argv[2] ?? ".cache/plane-demos/fixed-step");
await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
const manifest = { method: "fixed-step browser clock; not live performance", clips: [] };
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  await record(
    "01-default-orbit",
    async (page) => {
      await seedBody(page);
      await orient(page, [0, 0, 1]);
    },
    orbitDemo,
  );
  await record(
    "02-presets-and-preview",
    async (page) => {
      await seedBody(page);
      await orient(page, [0.9, -0.4, Math.sqrt(0.03)]);
    },
    settingsDemo,
  );
  await record(
    "03-away-from-origin",
    async (page) => {
      await reset(page);
      await orient(page, [0, 0, 1]);
    },
    awayDemo,
  );
} finally {
  await browser?.close();
  await server.close();
}

async function record(name, setup, route) {
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 },
    reducedMotion: "no-preference",
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.dismiss());
    await page.clock.install();
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => !!window.makeshiftInspect);
    await settled(page);
    await setup(page);
    await overlays(page);
    const capture = new FixedStepCapture(page, path.join(output, `${name}-frames`));
    await capture.start();
    console.log("Capturing", name);
    await route(page, capture);
    await capture.hold(0.7);
    const state = await capture.action(() => inspect(page));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, `${name}-preview.jpg`) });
    await writeFile(path.join(output, `${name}-state.json`), JSON.stringify(state, null, 2));
    const metadata = await capture.export(path.join(output, `${name}.mp4`));
    manifest.clips.push({ name, ...metadata });
    await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log("Exported", name, `${metadata.frames} frames`);
  } finally {
    await context.close();
  }
}

async function seedBody(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-12, -9], [12, 9]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("16");
  await page.keyboard.press("Enter");
  await settled(page);
  await page.keyboard.press("Enter");
  await settled(page);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).document.bodies.length, 1);
}

async function orbit(page, capture, dx, dy) {
  await page.mouse.move(750, 330);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  for (let i = 1; i <= 120; i++) {
    await page.mouse.move(750 + (dx * i) / 120, 330 + (dy * i) / 120);
    await capture.frame();
  }
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await capture.action(() => settled(page));
  await capture.hold(0.7);
}

async function orbitDemo(page, capture) {
  await label(
    page,
    "Head on: full configured visibility",
    "Default preset · 6% maximum fill · edge-on planes fade away.",
  );
  await capture.hold(1.6);
  await label(
    page,
    "Plane fades during orbit",
    "The grid and fill fade together with the actual 120 ms smoothing setting.",
  );
  await orbit(page, capture, -260, 100);
  await orbit(page, capture, 190, -110);
  await label(
    page,
    "Isometric views can show all three",
    "Presets configure facing-angle parameters, rather than a hard plane-count limit.",
  );
  await capture.action(() => orient(page, [1, -1, 1]));
  await capture.hold(2);
  assert.equal((await capture.action(() => inspect(page))).document.bodies.length, 1);
}

async function openSettings(page, capture) {
  await capture.action(async () => {
    await page.getByRole("button", { name: "Application settings" }).click();
    await page.getByRole("combobox", { name: "Plane visibility preset" }).scrollIntoViewIfNeeded();
  });
}

async function closeSettings(page, capture) {
  await capture.action(async () => {
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await settled(page);
  });
}

async function settingsDemo(page, capture) {
  await label(
    page,
    "Preset: usually one plane",
    "Compare the same angle with the broader two-plane preset.",
  );
  await capture.hold(1.6);
  await openSettings(page, capture);
  await capture.hold(0.8);
  await capture.action(() =>
    page.getByRole("combobox", { name: "Plane visibility preset" }).selectOption("choice"),
  );
  await capture.hold(1);
  await closeSettings(page, capture);
  await label(
    page,
    "Preset: usually two planes",
    "The second grid fades in at the same viewing angle.",
  );
  await capture.hold(1.8);
  await orbit(page, capture, -75, -45);
  await label(
    page,
    "Visible previews can remain non-selectable",
    "Minimum selectable visibility: 100% requires full visibility.",
  );
  await openSettings(page, capture);
  await capture.action(() =>
    page.getByRole("slider", { name: "Minimum selectable visibility", exact: true }).press("End"),
  );
  await capture.hold(0.9);
  await closeSettings(page, capture);
  await capture.action(() => orient(page, [1, -1, 1]));
  const previews = await capture.action(() => inspect(page));
  assert.ok(previews.planeTargets.every((plane) => plane.visible && !plane.selectable));
  await page.mouse.move(780, 474);
  await page.mouse.click(780, 474);
  await capture.hold(1.6);
  assert.ok(
    (await capture.action(() => inspect(page))).planeTargets.every((plane) => !plane.selected),
  );
  await label(
    page,
    "Optional preview jump",
    "Above the preview ceiling, the target becomes full configured visibility.",
  );
  await openSettings(page, capture);
  await capture.action(() =>
    page.getByRole("slider", { name: "Maximum preview visibility", exact: true }).press("Home"),
  );
  await capture.hold(1);
  await closeSettings(page, capture);
  await page.mouse.move(781, 475);
  await capture.hold(1);
  await page.mouse.click(781, 475);
  await capture.hold(1.5);
  assert.ok(
    (await capture.action(() => inspect(page))).planeTargets.some((plane) => plane.selected),
  );
}

async function awayDemo(page, capture) {
  await label(
    page,
    "Planes cover the view, beyond the origin",
    "Pan away: the grid and plane remain available for selection.",
  );
  await capture.hold(1.5);
  await page.mouse.move(660, 360);
  for (let i = 0; i < 36; i++) {
    await page.mouse.wheel(70, 42.5);
    await capture.hold(0.1);
  }
  await capture.action(() => settled(page));
  await capture.hold(1);
  await page.mouse.move(720, 444);
  await capture.hold(0.5);
  await page.mouse.click(720, 444);
  await capture.hold(1.2);
  assert.ok(
    (await capture.action(() => inspect(page))).planeTargets.find((plane) => plane.id === "XY")
      .selected,
  );
  await label(
    page,
    "Double-click to enter the plane",
    "Create a sketch here with the origin far offscreen.",
  );
  await page.mouse.dblclick(720, 444);
  await capture.action(() => settled(page));
  await capture.hold(0.7);
  const { camera } = await capture.action(() => inspect(page));
  await page.keyboard.press("r");
  const a = await capture.action(() => at(page, camera.target[0] - 10, camera.target[1] - 7));
  const b = await capture.action(() => at(page, camera.target[0] + 10, camera.target[1] + 7));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 45; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 45, a.y + ((b.y - a.y) * i) / 45);
    await capture.frame();
  }
  await page.mouse.up();
  const state = await capture.action(() => inspect(page));
  assert.equal(state.document.sketches[0].curves.length, 4);
  await label(
    page,
    "Normal sketch geometry, away from the origin",
    "A full-view reference grid, without an origin-bound selection widget.",
  );
  await capture.hold(1.8);
}
