import assert from "node:assert/strict";

// Desktop keyboard automation does not reproduce UIKit's native Undo dispatch.
// Exercise its beforeinput boundary against real pointer-created geometry.
export async function tabletNativeHistory(page) {
  const before = await page.evaluate(() => window.makeshiftInspect().document);
  await nativeHistory(page, "historyUndo", true);
  await page.waitForFunction(
    () => !window.makeshiftInspect().document.sketches.some((sketch) => sketch.curves.length),
  );
  await nativeHistory(page, "historyRedo", true);
  await page.waitForFunction(
    () => window.makeshiftInspect().document.sketches[0]?.curves.length === 1,
  );
  assert.deepEqual(await page.evaluate(() => window.makeshiftInspect().document), before);
  await page.keyboard.press("Meta+p");
  await page.getByRole("combobox", { name: "Find a tool" }).fill("rectangle");
  await nativeHistory(page, "historyUndo", false);
  await nativeHistory(page, "historyRedo", false);
  assert.deepEqual(await page.evaluate(() => window.makeshiftInspect().document), before);
  await page.keyboard.press("Escape");
}

async function nativeHistory(page, inputType, prevented) {
  assert.equal(
    await page.evaluate((inputType) => {
      const event = new InputEvent("beforeinput", {
        inputType,
        bubbles: true,
        cancelable: true,
      });
      // Native history identifies the original text-edit target, not the canvas.
      document.querySelector('[role="combobox"]').dispatchEvent(event);
      return event.defaultPrevented;
    }, inputType),
    prevented,
  );
}
