import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readPortableArchive } from "../.build/host/model/portable-archive.js";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const { workspace } = await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }));
  const original = (await inspect(page)).document;
  const source = `const s = await freac.createSketch({plane:"XY", curves:[{kind:"circle",center:{x:0,y:0},radius:3}]});
await freac.extrude({sources:s.profiles,distance:5,mode:"new"});`;
  await writeFile(join(workspace, "legacy.ts"), source);
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type(
    "freac run legacy.ts > legacy-result.json 2> legacy-error.txt; printf done > legacy.done",
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.makeshiftInspect().document.bodies?.length === 1);
  let completed = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    completed = (await readFile(join(workspace, "legacy.done"), "utf8").catch(() => "")) === "done";
    if (completed) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert(completed, "legacy CLI must finish writing before the portable snapshot");
  const created = (await inspect(page)).document;
  assert(Math.abs(created.bodies[0].volume - 45 * Math.PI) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, created);
  const path = resolve(".cache/sketch-review/legacy-script.makeshift");
  await saveDocument(page, path);
  const archive = readPortableArchive(await readFile(path));
  assert.equal(new TextDecoder().decode(archive.files["workspace/legacy.ts"]), source);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await agentIdle(page);
  await reset(page);
  await documentAt(page, null);
  assert.equal((await inspect(page)).document.sketches.length, 0);
  await settled(page);
  await agentIdle(page);
  await openDocument(page, path);
  await documentAt(page, path);
  await settled(page);
  const reopened = (await inspect(page)).document;
  assert.equal(reopened.bodies[0].id, created.bodies[0].id);
  assert(Math.abs(reopened.bodies[0].volume - created.bodies[0].volume) < 1e-6);
  await agentIdle(page);
  const closed = page.waitForEvent("close");
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "File")
      .submenu.items.find((item) => item.label === "Close")
      .click();
  });
  await closed;
  console.log(
    "Hidden Electron: legacy CLI/script geometry, Undo/Redo and portable script Save/Open",
  );
} finally {
  await app.close();
}

async function agentIdle(page) {
  await page.getByRole("button", { name: "Start", exact: true }).waitFor();
  for (let attempt = 0; attempt < 200; attempt++) {
    const status = await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }));
    if (!status.error && !status.running) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Agent lifecycle did not settle");
}

async function documentAt(page, path) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const status = await page.evaluate(() => window.makeshiftDocument.status());
    if (status.path === path && !(await inspect(page)).busy) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Document did not open: ${path}`);
}
