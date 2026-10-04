import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { installPenClassification } from "./ipad-pen.mjs";
import { at, close, drag, inspect, settled } from "./ui-helpers.mjs";
import { rectangleRoute } from "./ui-rectangle.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { calculatorRecovery } from "./web-calculator-recovery.mjs";
import { browserFileFailures } from "./web-files.mjs";
import { webMeshTools } from "./web-mesh-tools.mjs";
import { webTablet } from "./web-tablet.mjs";

const root = resolve(".build/web");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".png": "image/png",
};
// Plain files under a project subpath. No Vite middleware or native process can rescue a route.
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = resolve(root, path.replace(/^\/makeshift\//, "") || "index.html");
  try {
    if (!path.startsWith("/makeshift/") || !file.startsWith(`${root}/`))
      throw new Error("Not found");
    response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await mkdir(".cache/web-review", { recursive: true });
await mkdir(".cache/sketch-review", { recursive: true });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  for (const [name, runtime] of Object.entries({ chromium, webkit })) {
    const browser = await runtime.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 850 },
        hasTouch: true,
      });
      page.setDefaultTimeout(60_000);
      await installPenClassification(page);
      // Exercise the Safari download path on both engines; native chooser is covered separately.
      await page.addInitScript(() => {
        window.showSaveFilePicker = undefined;
      });
      const errors = [],
        requests = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
        console.error(error.message);
      });
      page.on("request", (request) => requests.push(request.url()));
      await page.goto(`http://127.0.0.1:${server.address().port}/makeshift/`);
      await settled(page);
      console.log(`${name}: editor ready`);
      assert.equal(await page.getByRole("button", { name: "Open agent terminal" }).count(), 0);
      assert.equal(
        requests.some((url) => /makeshift-(occt|kernel|solver)-.*\.wasm/.test(url)),
        false,
      );
      try {
        await route(page, name);
        for (const asset of ["occt", "kernel"]) {
          assert.ok(requests.some((url) => new RegExp(`makeshift-${asset}-.*\\.wasm`).test(url)));
        }
        await browserFileFailures(page);
        const download = page.waitForEvent("download");
        await chooseTool(page, "export step", "export-step");
        const step = await download;
        const stepPath = `.cache/web-review/${name}.step`;
        await step.saveAs(stepPath);
        assert.match(await readFile(stepPath, "utf8"), /ISO-10303-21/);
        const beforeOffline = (await inspect(page)).document.sketches.reduce(
          (sum, sketch) => sum + sketch.curves.length,
          0,
        );
        await page.context().setOffline(true);
        await chooseTool(page, "Sketch on XY", "sketch-xy");
        await page.keyboard.press("r");
        await drag(page, [-30, -25], [-20, -15]);
        assert.equal(
          (await inspect(page)).document.sketches.reduce(
            (sum, sketch) => sum + sketch.curves.length,
            0,
          ),
          beforeOffline + 4,
        );
        await page.context().setOffline(false);
        await rectangleRoute(page, `${name}-wasm`);
      } catch (error) {
        console.error(
          "UI state",
          await Promise.race([
            page.evaluate(() => {
              const state = window.makeshiftInspect?.() ?? {};
              return {
                busy: state.busy,
                message: state.message,
                interaction: state.interaction,
                solver: state.solver,
              };
            }),
            new Promise((resolve) => setTimeout(() => resolve("unresponsive"), 2000)),
          ]),
        );
        await page
          .screenshot({ path: `.cache/web-review/${name}-failure.png`, timeout: 2000 })
          .catch(() => {});
        throw error;
      }
      await webMeshTools(page, name);
      await webTablet(page, name);
      await calculatorRecovery(browser, page.url());
      assert.deepEqual(errors, []);
      assert.equal(
        requests.some((url) => /sketch-api|mesh-export|ghostty/.test(url)),
        false,
      );
      console.log(
        `${name}: standalone WASM drawing, constraints, solids, history and files passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

async function route(page, name) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  console.log(`${name}: rectangle drawn`);
  await page.getByRole("button", { name: "Lock Width", exact: true }).click();
  let state = await inspect(page);
  console.log(`${name}: constrained solve complete`);
  assert.ok(state.document.sketches[0].constraints.length);
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("40");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  const pick = await at(page, 5, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.ok(state.preview?.bodies?.[0], state.message);
  close(state.preview.bodies[0].volume, 4000);
  console.log(`${name}: WASM solid calculated`);
  await page.keyboard.press("Enter");
  await settled(page);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies[0].volume, 4000);
  await chooseTool(page, "new", "new");
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  close((await inspect(page)).document.bodies[0].volume, 4000);
  const downloadPromise = page.waitForEvent("download");
  await chooseTool(page, "save", "save");
  const download = await downloadPromise;
  const file = `.cache/web-review/${name}.makeshift`;
  await download.saveAs(file);
  await chooseTool(page, "new", "new");
  assert.equal((await inspect(page)).document.sketches.length, 0);
  await page.getByLabel("Open Makeshift file").setInputFiles(file);
  close((await inspect(page)).document.bodies[0].volume, 4000);
  await page.screenshot({ path: `.cache/web-review/${name}.png` });
}
