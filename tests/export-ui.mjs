import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { strFromU8, unzipSync } from "three/addons/libs/fflate.module.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { createServer } from "vite";
import { exportDocument, launchElectron } from "./native-documents.mjs";
import { readStep } from "./step-readback.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { exportCapture } from "./ui-export-capture.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const [name] = runtimeNames(["chromium", "webkit", "electron"], ["chromium"]);
let server, browser, app;
try {
  let page;
  if (name === "electron") {
    app = await launchElectron({
      args: ["."],
      env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
    });
    page = await app.firstWindow();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      false,
    );
  } else {
    server = await createServer({ server: { port: 0 } });
    await server.listen();
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.goto(server.resolvedUrls.local[0]);
  }
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => {
    throw error;
  });
  await inspect(page);
  await exportCapture(page, name, app);
  await reset(page);
  assert.equal(!(await toolEnabled(page, "export 3mf", "export-3mf")), true);
  assert.equal(await toolEnabled(page, "export step", "export-step"), false);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  // Grid-aligned dimensions avoid browser pointer-coordinate rounding.
  await page.keyboard.press("r");
  await drag(page, [-20, -10], [20, 10]);
  await drag(page, [30, -10], [40, 10]);
  assert.equal(!(await toolEnabled(page, "export 3mf", "export-3mf")), true);
  const pick = await at(page, 5, 3);
  const second = await at(page, 35, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await previewActionReady(page, "Accept extrusion");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  assert.equal(await toolEnabled(page, "export 3mf", "export-3mf"), true);
  assert.equal(await toolEnabled(page, "export step", "export-step"), true);
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  // Export is a tool switch: it completes the extrusion before reading accepted
  // bodies. Merely browsing its availability must leave the preview temporary.
  await exportDocument(page, "3mf", resolve(`.cache/sketch-review/${name}-preview-export.3mf`));
  assert.equal((await inspect(page)).document.bodies.length, 1);
  close((await inspect(page)).document.bodies[0].volume, 4000);
  assert.equal(await toolEnabled(page, "export 3mf", "export-3mf"), true);
  await page.mouse.click(second.x, second.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await previewActionReady(page, "Accept extrusion");
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await modalCompleted(page);
  assert.equal((await inspect(page)).document.bodies.length, 2);
  await page.getByRole("button", { name: "Hide Body 2", exact: true }).click();
  for (const format of ["3mf", "stl", "step"]) {
    assert.equal(await toolEnabled(page, `export ${format}`, `export-${format}`), true);
  }
  for (const [hide, show] of [
    ["Hide Body 1", "Show Body 1"],
    ["Hide bodies", "Show bodies"],
  ]) {
    if (hide === "Hide bodies") await chooseTool(page, hide, "hide-bodies");
    else await page.getByRole("button", { name: hide, exact: true }).click();
    for (const format of ["3mf", "stl", "step"]) {
      assert.equal(await toolEnabled(page, `export ${format}`, `export-${format}`), false);
    }
    if (show === "Show bodies") await chooseTool(page, show, "show-bodies");
    else await page.getByRole("button", { name: show, exact: true }).click();
  }
  const before = await inspect(page);
  for (const format of ["3mf", "stl", "step"]) {
    const path = resolve(`.cache/sketch-review/${name}-export.${format}`);
    const waiting = app
      ? app.evaluate(
          ({ BrowserWindow }, path) =>
            new Promise((resolve, reject) => {
              BrowserWindow.getAllWindows()[0].webContents.session.once(
                "will-download",
                (_, item) => {
                  item.setSavePath(path);
                  item.once("done", (_, state) =>
                    state === "completed" ? resolve(null) : reject(new Error(state)),
                  );
                },
              );
            }),
          path,
        )
      : page.waitForEvent("download");
    await chooseTool(page, `export ${format}`, `export-${format}`);
    const download = await waiting;
    if (download) {
      assert.equal(download.suggestedFilename(), `Untitled.${format}`);
      await download.saveAs(path);
    }
    const bytes = await readFile(path);
    if (format === "stl") {
      const geometry = new STLLoader().parse(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      geometry.computeBoundingBox();
      assert.deepEqual(geometry.boundingBox.min.toArray(), [-20, -10, 0]);
      assert.deepEqual(geometry.boundingBox.max.toArray(), [20, 10, 5]);
      assert.equal(geometry.attributes.position.count, 36);
      geometry.dispose();
    } else if (format === "3mf") {
      const files = unzipSync(bytes);
      const model = strFromU8(files["3D/3dmodel.model"]);
      const parsed = await page.evaluate((xml) => {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        return {
          errors: doc.getElementsByTagName("parsererror").length,
          unit: doc.documentElement.getAttribute("unit"),
          vertices: [...doc.getElementsByTagName("vertex")].map((v) =>
            ["x", "y", "z"].map((key) => Number(v.getAttribute(key))),
          ),
          triangles: doc.getElementsByTagName("triangle").length,
          items: doc.getElementsByTagName("item").length,
        };
      }, model);
      assert.equal(parsed.errors, 0);
      assert.equal(parsed.unit, "millimeter");
      assert.equal(parsed.items, 1);
      assert.equal(parsed.vertices.length, 8);
      assert.equal(parsed.triangles, 12);
      for (const axis of [0, 1, 2]) {
        close(Math.min(...parsed.vertices.map((v) => v[axis])), [-20, -10, 0][axis]);
        close(Math.max(...parsed.vertices.map((v) => v[axis])), [20, 10, 5][axis]);
      }
    } else {
      const shapes = readStep(path);
      assert.equal(shapes.length, 1);
      assert.equal(shapes[0].valid, true);
      assert.equal(shapes[0].exactFaces, 6);
      assert.equal(shapes[0].meshFaces, 0);
      shapes[0].bounds.forEach((value, i) => {
        close(value, [-20, -10, 0, 20, 10, 5][i]);
      });
      close(shapes[0].volume, 4000);
    }
    assert.deepEqual((await inspect(page)).document, before.document);
  }
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length, 1);
  assert.equal(await toolEnabled(page, "export 3mf", "export-3mf"), true);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, before.document);
  await bodyArchiveRoute(page, `${name}-export`, app);
  assert.equal(await toolEnabled(page, "export 3mf", "export-3mf"), true);
  await page.screenshot({ path: `.cache/sketch-review/${name}-export.png` });
  console.log(
    `${name}: real extrusion, temporary/empty guards, STL/3MF/STEP downloads, independent STEP readback, Undo/Redo and adjacent Save/Open pass`,
  );
} finally {
  await browser?.close();
  await app?.close();
  await server?.close();
}
