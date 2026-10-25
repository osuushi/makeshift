import assert from "node:assert/strict";
import { closeSettings, settingsSurface } from "./settings-surface.mjs";
import { click, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { radialLabelClicks } from "./ui-radial-label.mjs";
import { radialSolids } from "./ui-radial-solids.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Focus/draft ownership and native geometry acceptance cross the DOM boundary:
// a toggle must not blur/commit a numeric draft or reinterpret its original value.
await withUiRuntimes(async (page) => {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "circle", "circle");
  await drag(page, [0, 0], [8, 0]);
  const radius = page.getByRole("textbox", { name: "Radius", exact: true });
  await radius.waitFor({ state: "visible" });
  const before = (await inspect(page)).document;
  await radialLabelClicks(page.locator(".dimension input"));
  assert.deepEqual((await inspect(page)).document, before);
  await radius.focus();
  await page
    .getByRole("button", { name: "Switch to diameter", exact: false })
    .filter({ visible: true })
    .click();
  const diameter = page.getByRole("textbox", { name: "Diameter", exact: true });
  assert.equal(await diameter.inputValue(), "16");
  assert.equal(await diameter.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, before);
  await diameter.fill("20");
  await page
    .getByRole("button", { name: "Switch to radius", exact: false })
    .filter({ visible: true })
    .click();
  assert.equal(await radius.inputValue(), "10");
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("Enter");
  const circles = () =>
    inspect(page).then((s) =>
      s.document.sketches.flatMap((s) => s.curves.filter((c) => c.kind === "circle")),
    );
  close((await circles())[0].radius, 10);
  await radius.fill("invalid");
  await page
    .getByRole("button", { name: "Switch to diameter", exact: false })
    .filter({ visible: true })
    .click();
  assert.equal(await diameter.inputValue(), "invalid");
  await page.keyboard.press("Escape");
  close((await circles())[0].radius, 10);
  assert.equal(await diameter.inputValue(), "20");
  await page.getByRole("button", { name: "Lock Diameter", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove Diameter 20 mm constraint", exact: true })
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Unlock Diameter", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  await inspect(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await click(page, 10, 0);
  await diameter.waitFor({ state: "visible" });
  assert.equal(await diameter.inputValue(), "20");
  await diameter.fill("24");
  await page.keyboard.press("Enter");
  close((await circles())[0].radius, 12);
  await page.screenshot({ path: ".cache/sketch-review/radial-dimension.png" });
  const toggle = page.locator(".dimension .radial-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");
  assert.equal(await radius.inputValue(), "12");
  await page.keyboard.press("Space");
  assert.equal(await diameter.inputValue(), "24");
  await radialSettings(page, radius, diameter);
  await radialSolids(page);
  console.log("PASS radius/diameter draft conversion, locks, persistence and native circle edit");
});

async function radialSettings(page, radius, diameter) {
  const unchanged = (await inspect(page)).document;
  await page.getByRole("button", { name: "Application settings" }).click();
  const settings = await settingsSurface(page, "Interface");
  const preference = settings.getByRole("combobox", { name: "Circular dimensions" });
  assert.equal(await preference.inputValue(), "diameter");
  await preference.selectOption("radius");
  await radius.waitFor({ state: "visible" });
  assert.equal(await radius.inputValue(), "12");
  await settings.getByRole("tab", { name: "View", exact: true }).click();
  await radialLabelClicks(settings.locator(".radial-slider input"));
  await settings.getByRole("button", { name: "Switch to diameter", exact: false }).click();
  assert.equal(
    await settings.getByRole("slider", { name: "Diameter", exact: true }).inputValue(),
    "100",
  );
  await diameter.waitFor({ state: "visible" });
  await settings.page().screenshot({ path: ".cache/sketch-review/radial-settings.png" });
  await settings.getByRole("tab", { name: "Interface", exact: true }).click();
  assert.equal(await preference.inputValue(), "diameter");
  await closeSettings(settings);
  assert.deepEqual((await inspect(page)).document, unchanged);
}
