import assert from "node:assert/strict";
import { nameDrawing } from "./browser-library-helpers.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Supply only the harness registration boundary. The static app, WASM calculators,
// isolated script VM, archive codec and editor controls run normally.
export async function webSiteTools(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  try {
    await page.addInitScript(() => {
      const registered = new Map();
      Object.defineProperty(document, "modelContext", {
        value: {
          registerTool(tool, { signal }) {
            registered.set(tool.name, tool);
            signal.addEventListener("abort", () => registered.delete(tool.name));
          },
        },
      });
      window.callSiteTool = (name, args) => registered.get(name).execute(args);
    });
    await page.goto(url);
    await settled(page);
    const call = (name, args) =>
      page.evaluate(([name, args]) => window.callSiteTool(name, args), [name, args]);
    const fs = (op, args = {}) => call("makeshift_workspace", { op, ...args });
    const cad = (action, args = {}) => call("makeshift_run", { action, ...args });
    const tab = page.getByRole("button", { name: "Agent", exact: true });
    await tab.click();
    await page.getByText("Makeshift’s tools are registered in this tab.").waitFor();
    await tab.click();
    await fs("write", { path: "scratch", data: "temporary" });
    await fs("rm", { path: "scratch" });
    await chooseTool(page, "new document", "new");
    assert.equal(await page.getByRole("dialog", { name: "Unsaved changes" }).count(), 0);
    await settled(page);
    const source = `const s=await makeshift.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:3}]}); return (await makeshift.extrude({sources:s.profiles,mode:"new",distance:10})).bodies[0].volume;`;
    const path = "models/pin.js";
    assert.deepEqual(await fs("write", { path, data: source }), { ok: true });
    assert.deepEqual(await fs("ls"), [{ name: "models", type: "directory" }]);
    assert.deepEqual(await fs("write", { path: "binary/logo", data: "AP8=", encoding: "base64" }), {
      ok: true,
    });
    await fs("append", { path: "binary/logo", data: "AQ==", encoding: "base64" });
    await fs("cp", { path: "binary/logo", to: "binary/copy" });
    await fs("mv", { path: "binary/copy", to: "moved" });
    assert.equal(await fs("cat", { path: "moved", encoding: "base64" }), "AP8B");
    await fs("rm", { path: "moved" });
    assert.match((await fs("cat", { path: "moved" })).error, /exist/);
    assert.match((await fs("cat", { path: "../model.json" })).error, /path/);
    assert.match(await cad("types"), /interface MakeshiftScript/);
    const run = await cad("run", { path });
    assert.equal(run.changed, true, JSON.stringify(run));
    assert.ok(Math.abs(run.result - Math.PI * 90) < 0.001);
    assert.equal((await inspect(page)).document.bodies.length, 1);
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.sketches.length, 0);
    assert.equal(await fs("cat", { path }), source);
    await chooseTool(page, "new document", "new");
    await page
      .getByRole("dialog", { name: "Unsaved changes" })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    assert.equal(await fs("cat", { path }), source);
    const failure = await cad("run", {
      source:
        'await makeshift.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:1}]}); throw Error("rollback")',
    });
    assert.match(failure.error, /rollback/);
    assert.equal((await cad("inspect")).sketches.length, 0);
    const running = cad("run", { source: "while(true){}" });
    await page.getByRole("button", { name: "Cancel script" }).click();
    assert.match((await running).error, /cancel/i);
    await reopenWorkspace(page, fs, path, source);
  } finally {
    await page.close();
  }
}

async function reopenWorkspace(page, fs, path, source) {
  await chooseTool(page, "save document", "save");
  await Promise.all([
    nameDrawing(page, "Workspace test"),
    page.getByRole("button", { name: "Save unsigned", exact: true }).click(),
  ]);
  await settled(page);
  await chooseTool(page, "new document", "new");
  assert.deepEqual(await fs("ls"), []);
  await chooseTool(page, "open document", "open");
  await page.getByRole("button", { name: /Workspace test/ }).click();
  await settled(page);
  const declined = fs("cat", { path });
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  assert.match((await declined).error, /declined/);
  const reading = fs("cat", { path });
  await page.getByRole("button", { name: "Trust this version", exact: true }).click();
  assert.equal(await reading, source);
}
