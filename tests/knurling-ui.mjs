import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { recessedPreviewRoute } from "./ui-decorator-preview.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { knurlMembershipRoute, knurlMoveRoute } from "./ui-knurl-membership.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const names = runtimeNames(["chromium", "webkit", "electron"], ["chromium", "webkit"]);
const native = process.env.MAKESHIFT_TEST_BROWSER === "electron";
const server = native ? null : await createServer({ server: { port: 0 } });
await server?.listen();
try {
  for (const [name, engine] of Object.entries(
    native ? { electron: null } : { chromium, webkit },
  ).filter(([name]) => names.includes(name))) {
    const app = native
      ? await launchElectron({ args: ["."], env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" } })
      : null;
    const browser = engine ? await engine.launch({ headless: true }) : null;
    try {
      const page = app
        ? await app.firstWindow()
        : await browser.newPage({ viewport: { width: 1280, height: 900 } });
      if (app)
        assert.equal(
          await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
          false,
        );
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      if (server) await page.goto(server.resolvedUrls.local[0]);
      await reset(page);
      assert.equal(await toolEnabled(page, "knurling", "knurling"), false);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("c");
      await drag(page, [0, 0], [8, 0]);
      const center = await at(page, 0, 0);
      await chooseTool(page, "return to modeling", "modeling");
      await page.mouse.click(center.x, center.y);
      await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
      await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
      await page.keyboard.press("Enter");
      await inspect(page);
      await page.keyboard.press("Enter");
      await inspect(page);
      await orient(page, [0, -1, 0.3]);
      await worldClick(page, [0, -8, 5]);
      const original = (await inspect(page)).document.bodies[0];
      await chooseTool(page, "knurling", "knurling");
      assert.equal((await inspect(page)).document.decorators[0].definition, "freac.knurling");
      await recessedPreviewRoute(page, `${name}-knurling`);
      const presets = page.getByRole("combobox", { name: "Knurl preset", exact: true });
      assert.deepEqual(await presets.locator("option").allTextContents(), [
        "Fine",
        "Coarse",
        "Custom",
      ]);
      await presets.selectOption("coarse");
      assert.equal((await inspect(page)).document.decorators[0].settings.spacing, 3.6);
      const depth = page.getByRole("spinbutton", { name: "Knurl depth", exact: true });
      await depth.fill("0.5");
      await depth.press("Escape");
      assert.equal((await inspect(page)).document.decorators[0].settings.depth, 0.6);
      await depth.fill("0.5");
      await depth.press("Enter");
      assert.equal((await inspect(page)).document.decorators[0].settings.preset, "custom");
      await page
        .getByRole("combobox", { name: "Knurl relief", exact: true })
        .selectOption("raised");
      assert.equal((await inspect(page)).document.decorators[0].settings.mode, "raised");
      await chooseTool(page, "undo", "undo");
      assert.equal((await inspect(page)).document.decorators[0].settings.mode, "recessed");
      await chooseTool(page, "redo", "redo");
      assert.equal((await inspect(page)).document.decorators[0].settings.mode, "raised");
      assert.deepEqual((await inspect(page)).document.bodies[0], original);
      await bodyArchiveRoute(page, `${name}-knurling`);
      await orient(page, [0, -1, 0.3]);
      await worldClick(page, [0, -8, 5]);
      await knurlMoveRoute(page);
      await knurlMembershipRoute(page);
      await exportKnurl(page, name, app);
      await page.screenshot({ path: `.cache/sketch-review/${name}-knurling.png` });
      await page
        .getByRole("button", { name: "Remove knurling decorator from selected faces", exact: true })
        .click();
      assert.equal((await inspect(page)).document.decorators.length, 0);
      await chooseTool(page, "undo", "undo");
      assert.equal((await inspect(page)).document.decorators.length, 1);
      assert.deepEqual(errors, []);
      console.log(
        `${name}: knurling creation, preview/reselection, presets, numeric cancel/commit, Undo/Redo, archive, export and removal passed`,
      );
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server?.close();
}

async function exportKnurl(page, name, app) {
  const path = resolve(`.cache/sketch-review/${name}-knurling.3mf`);
  const waiting = app
    ? app.evaluate(
        ({ BrowserWindow }, destination) =>
          new Promise((resolve, reject) => {
            BrowserWindow.getAllWindows()[0].webContents.session.once(
              "will-download",
              (_, item) => {
                item.setSavePath(destination);
                item.once("done", (_, state) =>
                  state === "completed" ? resolve(null) : reject(new Error(state)),
                );
              },
            );
          }),
        path,
      )
    : page.waitForEvent("download");
  await chooseTool(page, "export 3mf", "export-3mf");
  const download = await waiting;
  if (download) await download.saveAs(path);
  assert.ok((await readFile(path)).length > 1000);
}
