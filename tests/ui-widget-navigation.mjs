import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

export async function widgetNavigationRoute(page, name) {
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Rotate layer", exact: true }).click();
  const original = (await inspect(page)).document;
  for (const label of ["Reposition body pivot", "Move body X", "Rotate body Z"]) {
    const widget = page.getByRole("button", { name: label, exact: true });
    await navigationOver(page, widget);
  }
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  const field = page.locator(".body-transform-value");
  await navigationOver(page, field);
  assert.equal(await field.inputValue(), "0", "Camera input must not change the numeric edit");
  const beforeOrbit = await page.evaluate(() => window.makeshiftInspect().camera.position);
  await orient(page, [1, 0.5, 1]);
  const afterOrbit = await page.evaluate(() => window.makeshiftInspect().camera.position);
  assert.ok(afterOrbit.some((value, index) => Math.abs(value - beforeOrbit[index]) > 1e-4));
  await page.keyboard.press("Escape");
  assert.deepEqual(await page.evaluate(() => window.makeshiftInspect().document), original);
  await page.keyboard.press("Escape");
  console.log(
    `${name}: widget scroll-pan, Command-drag orbit, pinch, right/middle drag pass through without edits`,
  );
}

async function navigationOver(page, widget) {
  for (const kind of ["pan", "pinch", "right", "middle"]) {
    await widget.hover({ timeout: 5000 });
    const before = (await inspect(page)).camera;
    if (kind === "right" || kind === "middle") {
      const box = await widget.boundingBox({ timeout: 5000 });
      await page.mouse.down({ button: kind });
      await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10, { steps: 4 });
      await page.mouse.up({ button: kind });
    } else {
      const key = kind === "pinch" ? "Control" : null;
      if (key) await page.keyboard.down(key);
      await page.mouse.wheel(10, kind === "pinch" ? -4 : 10);
      if (key) await page.keyboard.up(key);
    }
    const property = kind === "pinch" ? "height" : "target";
    await page.waitForFunction(
      ({ property, previous }) =>
        JSON.stringify(window.makeshiftInspect().camera[property]) !== JSON.stringify(previous),
      { property, previous: before[property] },
      { timeout: 5000 },
    );
    await page.waitForFunction(() => !window.makeshiftInspect().camera.moving, null, {
      timeout: 5000,
    });
  }
}
