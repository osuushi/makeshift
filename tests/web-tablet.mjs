import assert from "node:assert/strict";
import { penDriver } from "./ipad-pen.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function webTablet(page, name) {
  await reset(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  const cdp = name === "chromium" ? await page.context().newCDPSession(page) : undefined;
  try {
    const pen = await penDriver(page, cdp);
    await pen([-10, -5], [10, 5]);
    const before = (await inspect(page)).document;
    assert.equal(before.sketches[0].curves.length, 4);
    await page.touchscreen.tap(420, 750);
    assert.deepEqual((await inspect(page)).document, before, "A finger tap does not draw");
    await page.getByRole("textbox", { name: "Width", exact: true }).fill("25");
    await page.keyboard.press("Enter");
    assert.equal(
      await page.getByRole("textbox", { name: "Width", exact: true }).inputValue(),
      "25",
    );
    await page.screenshot({ path: `.cache/web-review/${name}-portrait.png` });
  } finally {
    await cdp?.detach();
    await page.evaluate(() => {
      window.testPen = false;
    });
    await page.setViewportSize({ width: 1280, height: 850 });
  }
}
