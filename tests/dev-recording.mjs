import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

// Real dev launcher/Vite origin: recording must also work outside the built file origin.
const profile = await mkdtemp(join(tmpdir(), "makeshift-dev-recording-"));
const child = spawn(
  process.execPath,
  ["scripts/dev.mjs", `--user-data-dir=${profile}`, "--remote-debugging-port=0"],
  { env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" }, stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
child.stdout.on("data", (chunk) => {
  output = (output + chunk).slice(-12000);
});
child.stderr.on("data", (chunk) => {
  output = (output + chunk).slice(-12000);
});
const exited = new Promise((resolve) => child.once("exit", resolve));
let browser, path;
try {
  let port;
  for (let i = 0; i < 900; i++) {
    port = await readFile(join(profile, "DevToolsActivePort"), "utf8").catch(() => "");
    if (port) break;
    if (child.exitCode !== null) throw new Error(output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!port) throw new Error(`Dev app failed to start: ${output}`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port.split("\n")[0]}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForFunction(() => !!window.makeshiftInspect);
  await page.locator("#startup").waitFor({ state: "detached" });
  assert.match(page.url(), /^http:\/\/(localhost|127\.0\.0\.1):/);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const tone = context.createOscillator(),
        destination = context.createMediaStreamDestination();
      tone.connect(destination);
      tone.start();
      return destination.stream;
    };
  });
  const shortcut = process.platform === "darwin" ? "Meta+b" : "Control+b";
  await page.keyboard.press(shortcut);
  await page.getByRole("status").filter({ hasText: "Recording window + microphone" }).waitFor();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await page.keyboard.press(shortcut);
  const field = page.getByRole("textbox", { name: "Bug report path" });
  await field.waitFor({ state: "visible" });
  path = await field.inputValue();
  assert.ok((await readFile(path)).byteLength > 1000);
  console.log("npm run dev launcher: Vite + signed app recording and ZIP save passed");
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 10000);
  await exited;
  clearTimeout(timeout);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (path) await rm(path, { force: true });
}
