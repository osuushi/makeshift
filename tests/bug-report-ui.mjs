import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { prepareDevBundle } from "../scripts/dev-bundle.mjs";
import { launchElectron } from "./native-documents.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// The Electron boundary is essential: real WebContents capture, media permissions,
// sandbox IPC, keyboard cancellation and native drag cannot be proven by model tests.
const app = await launchElectron({
  executablePath: await prepareDevBundle(),
  args: process.platform === "darwin" ? [] : ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
let saved;
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.waitForFunction(() => !!window.makeshiftInspect);
  await page.locator("#startup").waitFor({ state: "detached" });
  // Synthetic audio only: do not use Chromium's fake-device flag, which also
  // substitutes a green test pattern for the actual window video.
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      await audio.resume();
      const oscillator = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  await inspect(page);
  const before = await page.evaluate(() => window.makeshiftInspect());
  const shortcut = process.platform === "darwin" ? "Meta+b" : "Control+b";
  await page.keyboard.press(shortcut);
  await page.getByRole("status").filter({ hasText: "Recording window + microphone" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("status").filter({ hasText: "Bug recording cancelled" }).waitFor();
  const afterCancel = await page.evaluate(() => window.makeshiftInspect());
  assert.deepEqual(afterCancel.document, before.document);
  assert.deepEqual(afterCancel.preview, before.preview);
  assert.equal(afterCancel.tool, before.tool, "Escape cancels the report, not the drawing tool");
  // Enable via Settings so persistence and native-window storage delivery are exercised.
  await page.keyboard.press("v");
  await page.getByRole("button", { name: "Application settings" }).click();
  let settings;
  for (let tries = 0; tries < 100; tries++) {
    settings = app.windows().find((window) => window.url().includes("settings.html"));
    if (settings) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(settings);
  await settings.getByRole("tab", { name: "Bug Reports" }).click();
  await settings.getByRole("checkbox", { name: "Keep recent video for bug reports" }).check();
  await settings.getByRole("button", { name: "Done", exact: true }).click();
  // Wait for several independent rolling segments, then record across a boundary.
  await new Promise((resolve) => setTimeout(resolve, 17000));
  await page.keyboard.press(shortcut);
  await page.getByRole("status").filter({ hasText: "Recording window + microphone" }).waitFor();
  await page.mouse.move(600, 420);
  await page.mouse.click(600, 420);
  await new Promise((resolve) => setTimeout(resolve, 6000));
  await page.keyboard.press(shortcut);
  const path = page.getByRole("textbox", { name: "Bug report path" });
  await path.waitFor({ state: "visible" });
  saved = await path.inputValue();
  const files = unzipSync(await readFile(saved));
  await mkdir(".cache/bug-report-review", { recursive: true });
  await writeFile(".cache/bug-report-review/report.zip", await readFile(saved));
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  const events = JSON.parse(new TextDecoder().decode(files["events.json"]));
  const fixture = JSON.parse(new TextDecoder().decode(files["fixture-start.json"]));
  assert.deepEqual(fixture.snapshot.document, before.document);
  assert.ok(Array.isArray(fixture.snapshot.history));
  const videos = manifest.media.filter((media) => media.name.startsWith("video-"));
  assert.ok(videos.length >= 4);
  assert.ok(manifest.startedAt - videos[0].start >= 10000);
  assert.ok(manifest.startedAt - videos[0].start <= 21000);
  assert.ok(files["narration.webm"].length > 100);
  assert.ok(events.some((event) => event.kind === "pointerdown"));
  for (const video of videos) assert.ok(files[video.name].length > 100);
  await mkdir(".cache/bug-report-review", { recursive: true });
  for (const [name, bytes] of Object.entries(files))
    await writeFile(`.cache/bug-report-review/${name}`, bytes);
  await app.evaluate(({ BrowserWindow, shell }) => {
    const contents = BrowserWindow.getAllWindows().find(
      (window) => !window.webContents.getURL().includes("settings.html"),
    ).webContents;
    contents.startDrag = (item) => {
      globalThis.bugDrag = item.file;
    };
    shell.showItemInFolder = (file) => {
      globalThis.bugReveal = file;
    };
  });
  const file = page.getByRole("button", { name: "Drag bug report", exact: true });
  const bounds = await file.boundingBox();
  await page.mouse.move(bounds.x + 20, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 120, bounds.y + bounds.height / 2, { steps: 10 });
  await page.mouse.up();
  assert.equal(await app.evaluate(() => globalThis.bugDrag), saved);
  await file.click();
  assert.equal(await app.evaluate(() => globalThis.bugReveal), saved);
  const after = await page.evaluate(() => window.makeshiftInspect());
  assert.deepEqual(after.document, before.document);
  await page.screenshot({ path: ".cache/bug-report-review/panel.png" });
  console.log(
    `Bug report: real window capture, synthetic audio, prebuffer, cancel/save, ZIP and native drag/reveal passed: ${saved}`,
  );
} finally {
  await app.close();
  if (saved) await rm(saved, { force: true });
}
