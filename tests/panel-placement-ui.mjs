import assert from "node:assert/strict";
import { edgeFinishPrism } from "./ui-edge-finish-fixtures.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await edgeFinishPrism(page);
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    await chooseTool(page, "mirror", "mirror");
    const panel = page.locator(".mirror-widget:not([hidden])");
    const before = (await inspect(page)).document;
    const initial = await panel.boundingBox();
    const grip = await panel.locator(".parameter-panel-grip").boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 20);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 - 120, grip.y + 100, { steps: 8 });
    await page.mouse.up();
    const moved = await panel.boundingBox();
    assert.ok(Math.abs(moved.x - initial.x + 120) < 2);
    assert.ok(Math.abs(moved.y - initial.y - 80) < 2);
    await page.mouse.move(640, 450);
    await page.mouse.wheel(70, 40);
    await page.waitForTimeout(180);
    const tracked = await panel.boundingBox();
    assert.ok(Math.abs(tracked.x - moved.x) < 2);
    assert.ok(Math.abs(tracked.y - moved.y) < 2);
    await page.getByRole("textbox", { name: "Mirror offset", exact: true }).fill("5");
    await inspect(page);
    const edited = await panel.boundingBox();
    assert.ok(Math.abs(edited.x - moved.x) < 2);
    assert.ok(Math.abs(edited.y - moved.y) < 2);
    await page.getByRole("button", { name: "Cancel mirror", exact: true }).click();
    assert.deepEqual((await inspect(page)).document, before);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.makeshiftInspect));
    await edgeFinishPrism(page);
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    await chooseTool(page, "mirror", "mirror");
    const restored = await panel.boundingBox();
    assert.ok(Math.abs(restored.x - moved.x) < 2);
    assert.ok(Math.abs(restored.y - moved.y) < 2);
    await panel.locator(".parameter-panel-grip").focus();
    await page.keyboard.press("ArrowRight");
    const nudged = await panel.boundingBox();
    assert.ok(
      Math.abs(nudged.x - restored.x - 10) < 2,
      JSON.stringify({
        restored,
        nudged,
        focused: await page.evaluate(() => document.activeElement?.outerHTML),
      }),
    );
    await page.getByRole("button", { name: "Cancel mirror", exact: true }).click();
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    await drag(page, [-10, -10], [10, 10]);
    const width = page.getByRole("textbox", { name: "Width", exact: true });
    const dimension = page.locator(".dimension").filter({ has: width });
    const dimensionBefore = await dimension.boundingBox();
    const dimensionGrip = await dimension.locator(".parameter-panel-grip").boundingBox();
    const sketchBefore = (await inspect(page)).document;
    await page.mouse.move(dimensionGrip.x + 8, dimensionGrip.y + 8);
    await page.mouse.down();
    await page.mouse.move(dimensionGrip.x + 68, dimensionGrip.y + 88, { steps: 6 });
    await page.mouse.up();
    assert.deepEqual((await inspect(page)).document, sketchBefore);
    const dimensionMoved = await dimension.boundingBox();
    assert.ok(Math.abs(dimensionMoved.x - dimensionBefore.x - 60) < 2);
    await width.fill("26");
    await page.keyboard.press("Enter");
    await inspect(page);
    const dimensionEdited = await dimension.boundingBox();
    assert.ok(Math.abs(dimensionEdited.x - dimensionMoved.x) < 2);
    assert.ok(Math.abs(dimensionEdited.y - dimensionMoved.y) < 2);
    assert.equal(await width.inputValue(), "26");
    console.log(
      `${name}: panel drag, camera stability, cancel, reload and keyboard placement passed`,
    );
  },
  { allowed: ["chromium", "webkit"] },
);
