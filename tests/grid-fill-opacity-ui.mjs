import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(async (page, name) => {
  await orient(page, [1, -0.8, 0.3]);
  const secondary = async () =>
    (await inspect(page)).planeTargets.find((plane) => plane.id === "XZ");
  await page.getByRole("button", { name: "Application settings" }).click();
  const slider = page.getByRole("slider", { name: "Grid fill opacity", exact: true });
  assert.equal(await slider.inputValue(), "10");
  assert.equal(
    await page.getByRole("slider", { name: "Secondary plane opacity", exact: true }).count(),
    0,
  );
  await slider.press("Home");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await settled(page);
  assert.equal((await secondary()).opacity, 0);
  const emptyFill = await page.locator("canvas").screenshot();
  await page.getByRole("button", { name: "Application settings" }).click();
  await slider.press("End");
  await slider.press("ArrowLeft");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await settled(page);
  assert.ok(Math.abs((await secondary()).opacity - 0) < 0.001);
  assert.equal((await secondary()).selectable, false);
  assert.notDeepEqual(
    await page.locator("canvas").screenshot(),
    emptyFill,
    "Fill changes grid pixels",
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-grid-fill-opacity.png` });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  await page.getByRole("button", { name: "Application settings" }).click();
  assert.equal(await slider.inputValue(), "99.9");
  await page.getByRole("button", { name: "Reset grid display", exact: true }).click();
  assert.equal(await slider.inputValue(), "10");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await orient(page, [1, -0.8, 0.3]);
  await settled(page);
  assert.ok(Math.abs((await secondary()).opacity - 0) < 0.001);
  console.log(`${name}: white grid fill slider, rendered pixels, reload and reset passed`);
});
