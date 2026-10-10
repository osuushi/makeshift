import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer, preview } from "vite";
import { FixedStepCapture } from "../../.agents/skills/playwright-demo/scripts/fixed-step-capture.mjs";
import { reset, settled } from "../../tests/ui-helpers.mjs";
import { actions, pointer } from "./actions.mjs";
import { prepareCamera } from "./camera.mjs";
import { recipes } from "./recipes.mjs";

const output = path.resolve(process.env.DEMO_OUTPUT ?? "website/assets/demos");
const frames = path.resolve(".cache/feature-demo-frames");
const selected = process.env.DEMO_ONLY
  ? recipes.filter((r) => r.id === process.env.DEMO_ONLY)
  : recipes;
assert.ok(selected.length, "Unknown DEMO_ONLY recipe");
await mkdir(output, { recursive: true });
const web = process.argv.includes("--web");
const server = web
  ? await preview({ mode: "web", preview: { port: 0, host: "127.0.0.1" } })
  : await createServer({ server: { port: 0, watch: null, hmr: false } });
const manifest = {
  source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
  backend: web ? "release WASM" : "native development backend",
  method:
    "30 fps fixed-step browser clock; preserves animation timing, not a live performance measurement",
  viewport: { width: 960, height: 640 },
  clips: [],
};
let browser;
try {
  if (!web) await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const recipe of selected) await record(recipe);
  await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  await browser?.close();
  if (web) await new Promise((resolve) => server.httpServer.close(resolve));
  else await server.close();
}

async function record(recipe) {
  const context = await browser.newContext({
    viewport: manifest.viewport,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) =>
    dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss(),
  );
  try {
    console.log(`Preparing ${recipe.id}`);
    await page.clock.install();
    await page.goto(server.resolvedUrls.local[0]);
    await settled(page);
    await reset(page);
    await recipe.setup(page);
    await prepareCamera(page, recipe.focus);
    await pointer(page);
    const capture = new FixedStepCapture(page, path.join(frames, recipe.id));
    await capture.start();
    const a = actions(page, capture);
    await capture.hold(1);
    console.log(`Recording ${recipe.id}`);
    await recipe.record(page, capture, a);
    await page.keyboard.press("Escape");
    await page.mouse.move(800, 590);
    await capture.hold(2.5);
    assert.deepEqual(errors, []);
    const state = await a.state();
    await writeFile(path.join(frames, `${recipe.id}-state.json`), JSON.stringify(state, null, 2));
    await page.screenshot({
      path: path.join(output, `${recipe.id}.jpg`),
      type: "jpeg",
      quality: 88,
    });
    const temporary = path.join(output, `${recipe.id}.partial.mp4`);
    const metadata = await capture.export(temporary);
    const stream = metadata.streams[0];
    assert.equal(stream.width, 960);
    assert.equal(stream.height, 640);
    assert.equal(stream.avg_frame_rate, "30/1");
    await copyFile(temporary, path.join(output, `${recipe.id}.mp4`));
    await rm(temporary);
    manifest.clips.push({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      ...metadata,
    });
    console.log(`Verified ${recipe.id}: ${metadata.frames} frames, ${metadata.format.duration}s`);
    await rm(capture.directory, { recursive: true });
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${recipe.id}-failure.png`) }).catch(() => {});
    console.error(
      await page
        .evaluate(() => {
          const s = window.makeshiftInspect?.();
          return {
            notice: s?.notice,
            interaction: s?.interaction,
            selection: s?.modelingSelection,
          };
        })
        .catch(() => null),
    );
    throw error;
  } finally {
    await context.close();
  }
}
