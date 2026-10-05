import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { customContinueRoute } from "./ui-decorator-continue.mjs";
import { customDecoratorRoute } from "./ui-decorator-custom.mjs";
import { decoratorInformationRoute } from "./ui-decorator-information.mjs";
import { decoratorMembershipRoute } from "./ui-decorator-membership.mjs";
import { mixedDecoratorTypesRoute } from "./ui-decorator-mixed-types.mjs";
import { decoratorPresetRoute } from "./ui-decorator-presets.mjs";
import { recessedPreviewRoute } from "./ui-decorator-preview.mjs";
import { decoratorTransformRoute } from "./ui-decorator-transforms.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
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
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.setDefaultTimeout(30000);
      if (server) await page.goto(server.resolvedUrls.local[0]);
      await reset(page);
      assert.equal(await toolEnabled(page, "threads", "threads"), false);
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
      assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
      await chooseTool(page, "threads", "threads");
      assert.equal((await inspect(page)).document.decorators.length, 1);
      await recessedPreviewRoute(page, name);
      await decoratorPresetRoute(page, name);
      const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
      await pitch.fill("2.5");
      assert.equal((await inspect(page)).document.decorators[0].settings.pitch, 2);
      await pitch.press("Escape");
      assert.equal((await inspect(page)).document.decorators[0].settings.pitch, 2);
      await pitch.fill("2.5");
      await pitch.press("Enter");
      assert.equal((await inspect(page)).document.decorators[0].settings.pitch, 2.5);
      const cut = page.getByRole("combobox", { name: "Cut into", exact: true });
      assert.deepEqual(await cut.locator("option").allTextContents(), ["Rod", "Hole"]);
      await cut.selectOption("hole");
      assert.equal((await inspect(page)).document.decorators[0].settings.cut, "hole");
      assert.deepEqual((await inspect(page)).document.bodies[0], original);
      await chooseTool(page, "undo", "undo");
      assert.equal((await inspect(page)).document.decorators[0].settings.cut, "rod");
      await chooseTool(page, "redo", "redo");
      assert.equal((await inspect(page)).document.decorators[0].settings.cut, "hole");
      if (!app) {
        let downloads = 0;
        const countDownload = () => {
          downloads++;
        };
        page.on("download", countDownload);
        await chooseTool(page, "export 3mf", "export-3mf");
        await chooseTool(page, "cancel export", "cancel-export");
        assert.equal(await toolEnabled(page, "cancel export", "cancel-export"), false);
        await exportDecorated(page, name, app);
        assert.equal(downloads, 1, "cancelled export must not publish a file");
        page.off("download", countDownload);
      } else await exportDecorated(page, name, app);
      await page.screenshot({ path: `.cache/sketch-review/${name}-decorators.png` });
      await bodyArchiveRoute(page, `${name}-decorators`);
      assert.equal((await inspect(page)).document.decorators[0].settings.pitch, 2.5);
      await decoratorTransformRoute(page);
      await orient(page, [0, -1, 0.3]);
      await worldClick(page, [0, -8, 5]);
      await page
        .getByRole("button", { name: "Remove thread decorator from selected faces", exact: true })
        .click();
      assert.equal((await inspect(page)).document.decorators.length, 0);
      await decoratorMembershipRoute(page);
      await exportDecorated(page, `${name}-split`, app);
      await page.screenshot({ path: `.cache/sketch-review/${name}-decorator-membership.png` });
      await decoratorInformationRoute(page);
      await customDecoratorRoute(page);
      await customContinueRoute(page, app);
      await exportDecorated(page, `${name}-custom`, app);
      await mixedDecoratorTypesRoute(page);
      assert.deepEqual(errors, []);
      console.log(
        `${name}: real cylinder, selection, threads, draft/cancel, edits, Undo/Redo, export, Save/Open and removal passed`,
      );
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server?.close();
}

async function exportDecorated(page, name, app) {
  const path = resolve(`.cache/sketch-review/${name}-decorated.3mf`);
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
