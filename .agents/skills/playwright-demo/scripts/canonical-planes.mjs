import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { openDocument } from "../../../../tests/native-documents.mjs";
import { orient, project } from "../../../../tests/ui-blend-edit.mjs";
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
  await record("02-secondary-selection", async (page) => {
    await reset(page);
    const fixture = JSON.parse(await readFile("tests/fixtures/plane-cut-bent-shell.json", "utf8"));
    await openDocument(page, { name: "cue-split.makeshift", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document: fixture.document })) });
    await orient(page, [1, -0.8, 0.3]);
  }, selectionDemo);
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
  await label(page, "One clear coordinate grid", "The primary keeps the configured opacity.");
  await capture.hold(1);
  await label(page, "A faint secondary provides orientation", "Signed depth fading softens the far side; bodies occlude the grids.");
  await orbit(page, capture, -190, 80);
  await capture.action(() => orient(page, [1, -0.8, 0.3]));
  await capture.hold(1);
  const state = await capture.action(() => inspect(page));
  assert.equal(state.planeTargets.filter((plane) => plane.selectable).length, 1);
  assert.equal(state.planeTargets.filter((plane) => plane.visible).length, 2);
  assert.equal(state.document.bodies.length, 1);
}

async function selectionDemo(page, capture) {
  await label(page, "Secondary cues do not intercept ordinary clicks", "Only the stronger primary selects during normal modeling.");
  const point = await capture.action(() => project(page, [30, 0, -18]));
  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  await capture.hold(1);
  assert.equal((await capture.action(() => inspect(page))).planeTargets.find((p) => p.id === "XZ").selected, false);
  await label(page, "Split asks for a plane", "The visible secondary now accepts a normal canvas click.");
  await capture.action(async () => {
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    await chooseTool(page, "Split Body", "split");
  });
  await capture.hold(0.7);
  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  await capture.action(() => inspect(page));
  const state = await capture.action(() => inspect(page));
  assert.ok(state.preview?.bodies.length >= 2, state.notice);
  await capture.action(() => page.getByText("Cutter · XZ world plane", { exact: true }).waitFor());
  await label(page, "Secondary XZ plane selected", "The real split preview is temporary until acceptance.");
  await capture.hold(1.2);
}
