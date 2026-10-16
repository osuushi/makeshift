import assert from "node:assert/strict";
import { tabletNativeHistory } from "./tablet-native-history.mjs";
import { at, drag, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

// Safari command keypress delivery and HTTP clipboard fallback are browser-specific.
await withUiRuntimes(
  async (page, name) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "platform", { value: "MacIntel" });
      Object.defineProperty(navigator, "maxTouchPoints", { value: 5 });
    });
    await reset(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      window.addEventListener("copy", (event) => {
        window.copiedGeometry =
          document.activeElement?.value ?? event.clipboardData?.getData("text/plain");
      });
    });
    await page.keyboard.press("Meta+p");
    await page.getByRole("combobox", { name: "Find a tool" }).fill("Sketch on XY");
    await page.locator('[data-command="sketch-xy"]').click();
    await page.waitForFunction(
      () =>
        window.makeshiftInspect().activePlane === "XY" && !window.makeshiftInspect().camera.moving,
    );
    await page.keyboard.press("l");
    await drag(page, [-20, 0], [20, 0]);
    await tabletNativeHistory(page);
    await page.keyboard.press("Escape");
    const point = await at(page, 0, 0);
    await page.mouse.click(point.x, point.y);
    await commandPress(page, "c");
    const text = await page.evaluate(() => window.copiedGeometry);
    assert.equal(JSON.parse(text).geometry.sketches[0].curves.length, 1);
    await page.getByRole("button", { name: "File / Edit", exact: true }).click();
    await page.locator('[role="menuitem"][data-command="copy"]').click();
    assert.equal(
      JSON.parse(await page.evaluate(() => window.copiedGeometry)).geometry.sketches[0].curves
        .length,
      1,
    );
    await page.locator("canvas").focus();
    await page.keyboard.press("Meta+v");
    await page.waitForFunction(
      () => window.makeshiftInspect().document.sketches[0].curves.length === 2,
    );
    await page.keyboard.press("Meta+z");
    await page.waitForFunction(
      () => window.makeshiftInspect().document.sketches[0].curves.length === 1,
    );
    await page.getByRole("button", { name: "File / Edit", exact: true }).click();
    await page.locator('[role="menuitem"][data-command="paste"]').click();
    assert.equal(await page.getByRole("dialog", { name: "Paste geometry" }).count(), 0);
    await page.waitForFunction(
      () => window.makeshiftInspect().document.sketches[0].curves.length === 2,
    );
    await page.locator("canvas").focus();
    await page.keyboard.press("Meta+z");
    await page.waitForFunction(
      () => window.makeshiftInspect().document.sketches[0].curves.length === 1,
    );
    await commandPress(page, "y");
    await page.waitForFunction(
      () => window.makeshiftInspect().document.sketches[0].curves.length === 2,
    );
    await page.getByRole("button", { name: "File / Edit", exact: true }).click();
    assert.match(
      await page.locator('[role="menuitem"][data-command="new"]').textContent(),
      /Ctrl\+N/,
    );
    await page.keyboard.press("Escape");
    await page.locator("canvas").focus();
    await page.keyboard.press("Control+n");
    const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
    await dialog.getByRole("button", { name: "Don’t Save", exact: true }).click();
    await page.waitForFunction(() => !window.makeshiftInspect().document.sketches.length);
    await page.locator("canvas").focus();
    await page.keyboard.press("Meta+v");
    await page.waitForFunction(
      () => window.makeshiftInspect().document.sketches[0]?.curves.length === 1,
    );
    console.log(
      `${name}: command keypress New/Redo/Copy, HTTP local keyboard/menu Paste and history pass`,
    );
  },
  { allowed: ["chromium", "webkit"] },
);

async function commandPress(page, key, shiftKey = false) {
  assert.equal(
    await page.evaluate(
      ({ key, shiftKey }) => {
        const event = new KeyboardEvent("keypress", {
          key,
          metaKey: true,
          shiftKey,
          bubbles: true,
          cancelable: true,
        });
        document.querySelector("canvas").focus();
        document.activeElement.dispatchEvent(event);
        return event.defaultPrevented;
      },
      { key, shiftKey },
    ),
    true,
  );
}
