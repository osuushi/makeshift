import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { unzipSync } from "fflate";
import { prepareDevBundle } from "../scripts/dev-bundle.mjs";
import { launchElectron } from "./native-documents.mjs";

// Explicit local QA only: records one second of physical microphone audio.
// Never add this to unattended CI. The temporary report is removed on completion.
const app = await launchElectron({
  executablePath: await prepareDevBundle(),
  args: process.platform === "darwin" ? [] : ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
let path;
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.makeshiftInspect);
  await page.locator("#startup").waitFor({ state: "detached" });
  const shortcut = process.platform === "darwin" ? "Meta+b" : "Control+b";
  await page.keyboard.press(shortcut);
  await page
    .getByRole("status")
    .filter({ hasText: "Recording window + microphone" })
    .waitFor({ timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await page.keyboard.press(shortcut);
  const field = page.getByRole("textbox", { name: "Bug report path" });
  await field.waitFor({ state: "visible" });
  path = await field.inputValue();
  const files = unzipSync(await readFile(path));
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  assert.ok(files["narration.webm"].byteLength > 100);
  assert.deepEqual(manifest.warnings, []);
  console.log(
    "Development app: physical microphone + own-window recording saved successfully; temporary audio will be deleted.",
  );
} finally {
  await app.close();
  if (path) await rm(path, { force: true });
}
