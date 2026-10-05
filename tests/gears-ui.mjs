import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { recessedPreviewRoute } from "./ui-decorator-preview.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { exportGear } from "./ui-gear-export.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

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
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(30000);
      if (server) await page.goto(server.resolvedUrls.local[0]);
      await reset(page);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("c");
      await drag(page, [0, 0], [10, 0]);
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
      await worldClick(page, [0, -10, 5]);
      await chooseTool(page, "gear", "gear");
      assert.equal((await inspect(page)).document.decorators[0].definition, "freac.gear");
      const teeth = page.getByRole("spinbutton", { name: "Teeth per revolution", exact: true });
      await teeth.fill("36");
      await teeth.press("Escape");
      assert.equal((await inspect(page)).document.decorators[0].settings.teeth, 40);
      await teeth.fill("36");
      await teeth.press("Enter");
      assert.equal((await inspect(page)).document.decorators[0].settings.teeth, 36);
      const helix = page.getByRole("spinbutton", { name: "Helix angle", exact: true });
      await helix.fill("25");
      await helix.press("Enter");
      assert.equal((await inspect(page)).document.decorators[0].settings.helix, 25);
      await chooseTool(page, "undo", "undo");
      assert.equal((await inspect(page)).document.decorators[0].settings.helix, 0);
      await chooseTool(page, "redo", "redo");
      assert.equal((await inspect(page)).document.decorators[0].settings.helix, 25);
      await page.getByRole("button", { name: "Resize to module", exact: true }).click();
      const targetModule = page.getByRole("spinbutton", {
        name: "Target normal module",
        exact: true,
      });
      await targetModule.fill("0.6");
      await page.getByRole("button", { name: "Preview radius", exact: true }).click();
      await inspect(page);
      assert.equal(
        (await inspect(page)).document.bodies[0].faces.find((f) => f.cylinder).cylinder.radius,
        10,
      );
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await inspect(page);
      await page.getByRole("button", { name: "Resize to module", exact: true }).click();
      await targetModule.fill("0.6");
      await page.getByRole("button", { name: "Preview radius", exact: true }).click();
      await page.getByRole("button", { name: "Accept radius", exact: true }).click();
      const resized = (await inspect(page)).document.bodies[0].faces.find((f) => f.cylinder)
        .cylinder.radius;
      assert.ok(Math.abs(resized - (36 * 0.6) / (2 * Math.cos((25 * Math.PI) / 180))) < 1e-7);
      await chooseTool(page, "undo", "undo");
      assert.equal(
        (await inspect(page)).document.bodies[0].faces.find((f) => f.cylinder).cylinder.radius,
        10,
      );
      await page.screenshot({ path: `.cache/sketch-review/${name}-gear.png` });
      await exportGear(page, `${name}-gear`, app);
      await bodyArchiveRoute(page, `${name}-gear`);
      await orient(page, [0, -1, 0.3]);
      await worldClick(page, [0, -10, 5]);
      assert.equal(await teeth.inputValue(), "36");
      await page
        .getByRole("button", { name: "Remove Gear decorator from selected faces", exact: true })
        .click();
      assert.equal((await inspect(page)).document.decorators.length, 0);
      await orient(page, [0, 0, 1]);
      await worldClick(page, [0, 0, 10]);
      await chooseTool(page, "gear", "gear");
      const module = page.getByRole("spinbutton", { name: "Rack normal module", exact: true });
      await module.fill("1.5");
      await module.press("Enter");
      assert.equal((await inspect(page)).document.decorators[0].settings.module, 1.5);
      await page.screenshot({ path: `.cache/sketch-review/${name}-rack.png` });
      await exportGear(page, `${name}-rack`, app, "stl");
      await reset(page);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("c");
      await drag(page, [0, 0], [10, 0]);
      const bevelCenter = await at(page, 0, 0);
      await chooseTool(page, "return to modeling", "modeling");
      await page.mouse.click(bevelCenter.x, bevelCenter.y);
      await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
      await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
      await page
        .getByRole("combobox", { name: "Draft measurement", exact: true })
        .selectOption("angle");
      await page.getByRole("textbox", { name: "Draft value", exact: true }).fill("20");
      await page.keyboard.press("Enter");
      await inspect(page);
      await page.keyboard.press("Enter");
      await inspect(page);
      const coneBody = (await inspect(page)).document.bodies[0];
      assert.ok(coneBody.faces.some((f) => f.cone));
      await orient(page, [0, -1, 0.3]);
      await worldClick(page, [0, -(10 + 5 * Math.tan((20 * Math.PI) / 180)), 5]);
      await chooseTool(page, "gear", "gear");
      assert.equal((await inspect(page)).document.decorators.length, 1);
      await exportGear(page, `${name}-bevel`, app);
      await recessedPreviewRoute(page, `${name}-bevel`, [
        0,
        -(10 + 5 * Math.tan((20 * Math.PI) / 180)),
        5,
      ]);
      await page.screenshot({ path: `.cache/sketch-review/${name}-bevel.png` });
      assert.deepEqual(errors, []);
      console.log(
        `${name}: gear/rack ordinary creation, draft/cancel, settings, Undo/Redo, Save/Open, reselection/removal passed`,
      );
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server?.close();
}
