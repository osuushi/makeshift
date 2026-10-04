import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer, preview } from "vite";
import { cameraRoute } from "./ui-camera.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const names = runtimeNames(["chromium", "webkit"]);
const server = process.env.WEB_MODE
  ? await preview({ mode: "web", preview: { port: 0 } })
  : await createServer({ server: { port: 0 } });
if ("listen" in server) await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([name]) =>
    names.includes(name),
  )) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      page.on("dialog", (dialog) => dialog.accept());
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.resolvedUrls.local[0]);
      await reset(page);
      const control = page.getByTitle("Controls", { exact: true });
      assert.equal(await control.innerText(), "Trackpad");
      const trackpad = page.getByRole("radio", { name: "Trackpad", exact: true });
      const mouse = page.getByRole("radio", { name: "Mouse", exact: true });
      await control.click();
      assert.ok(await trackpad.isChecked());
      await trackpad.focus();
      await page.keyboard.press("ArrowDown");
      assert.ok(await mouse.isChecked());
      assert.equal(await control.innerText(), "Mouse");
      assert.equal(await trackpad.isChecked(), false);
      await page.keyboard.press("Escape");
      await page.reload();
      await inspect(page);
      await control.click();
      assert.ok(await mouse.isChecked(), "Mouse survives reload");
      const menuBounds = await page.locator("#control-menu").boundingBox();
      const buttonBounds = await control.boundingBox();
      assert.ok(menuBounds.y >= buttonBounds.y + buttonBounds.height);
      await page.screenshot({ path: `/tmp/makeshift-control-${name}.png` });
      await page.mouse.click(900, 650);
      assert.equal(await control.getAttribute("aria-expanded"), "false");
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("r");
      await drag(page, [0, 0], [20, 10]);
      await page.keyboard.press("Escape");
      const before = await inspect(page);
      await control.click();
      await page.keyboard.press("Escape");
      assert.equal((await inspect(page)).activePlane, before.activePlane);
      await page.mouse.move(980, 620);
      await page.mouse.wheel(0, -100);
      await page.waitForFunction(
        (height) => window.makeshiftInspect().camera.height < height,
        before.camera.height,
      );
      const zoomed = await inspect(page);
      assert.equal(zoomed.activePlane, "XY");
      assert.deepEqual(zoomed.document, before.document);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(900, 560, { steps: 6 });
      await page.mouse.up({ button: "middle" });
      const panned = await inspect(page);
      assert.notDeepEqual(panned.camera.target, zoomed.camera.target);
      assert.equal(panned.camera.height, zoomed.camera.height);
      await page.keyboard.down("Shift");
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(960, 610, { steps: 6 });
      await page.mouse.up({ button: "middle" });
      await page.keyboard.up("Shift");
      const rotated = await inspect(page);
      assert.equal(rotated.activePlane, null);
      assert.notDeepEqual(rotated.camera.position, panned.camera.position);
      assert.deepEqual(rotated.document, before.document);
      await page.keyboard.down("Shift");
      await page.keyboard.down("Alt");
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(1010, 610, { steps: 4 });
      const rolling = await inspect(page);
      await page.mouse.up({ button: "middle" });
      await page.keyboard.up("Alt");
      await page.keyboard.up("Shift");
      const rolled = await inspect(page);
      assert.notDeepEqual(rolling.camera.up, rotated.camera.up);
      assert.notDeepEqual(rolled.camera.up, rolling.camera.up, "Mouse roll snaps on release");
      for (let i = 0; i < 3; i++)
        assert.ok(Math.abs(rolled.camera.position[i] - rotated.camera.position[i]) < 1e-8);
      assert.deepEqual(rolled.document, before.document);
      await control.click();
      await trackpad.check();

      assert.equal(await mouse.isChecked(), false);
      await page.keyboard.press("Escape");
      await page.reload();
      await inspect(page);
      await control.click();
      assert.ok(await trackpad.isChecked(), "Trackpad survives reload");
      await page.keyboard.press("Escape");
      await cameraRoute(page, name);
      assert.deepEqual(errors, []);
      console.log(
        `${name}: Control persistence, keyboard, mouse navigation and trackpad regression passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  if ("close" in server) await server.close();
  else await new Promise((resolve) => server.httpServer.close(resolve));
}
