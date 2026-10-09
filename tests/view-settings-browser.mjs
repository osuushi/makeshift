import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await modalSettingsRoute(page);
    await migrationRoute(page);
    await opacitySettingsRoute(page);
    const open = () => page.getByRole("button", { name: "Application settings" }).click();
    const done = () => page.getByRole("button", { name: "Done", exact: true }).click();
    const slider = (title) => page.getByRole("slider", { name: title, exact: true });
    await page.getByRole("button", { name: "Reset grid display" }).click();
    assert.equal(await page.getByRole("combobox", { name: "Plane visibility preset" }).count(), 0);
    assert.equal(await slider("Angle cutoff").count(), 0);
    const thickness = slider("Grid line thickness");
    assert.equal(await thickness.inputValue(), "1");
    await thickness.press("End");
    const color = page.getByLabel("XY plane color", { exact: true });
    await color.fill("#123456");
    await color.dispatchEvent("input");
    await page.getByRole("textbox", { name: "Plane palette name" }).fill("My planes");
    await page.getByRole("button", { name: "Save palette" }).click();
    await color.fill("#654321");
    await color.dispatchEvent("input");
    await page.getByRole("combobox", { name: "Saved plane palette" }).selectOption("My planes");
    assert.equal(await color.inputValue(), "#123456");
    await done();
    await page.reload();
    await settled(page);
    await open();
    assert.equal(await color.inputValue(), "#123456");
    assert.equal(await thickness.inputValue(), "3", "Grid thickness persists across reload");
    await page.getByRole("button", { name: "Reset plane grids" }).click();
    assert.equal(await color.inputValue(), "#d4ae3a");
    await page.getByRole("combobox", { name: "Saved plane palette" }).selectOption("My planes");
    assert.equal(await color.inputValue(), "#123456", "Reset preserves saved palettes");
    assert.equal(
      await page.getByRole("combobox", { name: "Saved plane palette" }).inputValue(),
      "My planes",
    );
    await done();
    await orient(page, [0, 0, 1]);
    await page.getByRole("button", { name: "Application settings" }).hover();
    const state = await inspect(page);
    const xy = state.planeTargets.find((p) => p.id === "XY");
    assert.equal(xy.color, "#123456");
    assert.equal(xy.fillOpacity, 0);
    assert.equal(xy.selectable, true);
    assert.ok(
      state.planeTargets.filter((p) => p.id !== "XY").every((p) => !p.selectable && !p.visible),
    );
    const thickGrid = await page.locator("canvas").screenshot();
    await open();
    await thickness.press("Home");
    await done();
    await settled(page);
    const thinGrid = await page.locator("canvas").screenshot();
    assert.notDeepEqual(thickGrid, thinGrid, "Thickness changes rendered grid pixels");
    await open();
    await page.screenshot({ path: `.cache/sketch-review/${name}-grid-settings-dialog.png` });
    await page.getByRole("combobox", { name: "Saved plane palette" }).selectOption("My planes");
    await page.getByRole("button", { name: "Delete palette" }).click();
    assert.equal(
      await page.getByRole("combobox", { name: "Saved plane palette" }).locator("option").count(),
      1,
    );
    await page.getByRole("button", { name: "Reset plane grids" }).click();
    await done();
    await page.screenshot({ path: `.cache/sketch-review/${name}-plane-visibility-settings.png` });
    console.log(
      `${name}: real Settings controls, renderer, grid thickness, palettes, reload and reset passed`,
    );
  },
  { defaults: ["chromium", "webkit"] },
);

async function modalSettingsRoute(page) {
  await settled(page);
  const trigger = page.getByRole("button", { name: "Application settings" });
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  // macOS WebKit leaves clicked buttons unfocused. Use keyboard activation to
  // establish an opener whose focus the native modal must restore on Escape.
  await trigger.press("Space");
  assert.equal(await dialog.evaluate((element) => element.matches(":modal")), true);
  const bounds = await dialog.boundingBox();
  assert.ok(bounds && bounds.height < 760, "Compact settings fit the desktop viewport");
  await page.mouse.click(bounds.x + 3, bounds.y + 3);
  assert.equal(await dialog.isVisible(), true, "Dialog padding does not dismiss settings");
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), false);
  // Visibility changes synchronously; the native close event restores focus
  // in a later task. Require that restoration before checking its target.
  await page.waitForFunction(() => document.activeElement?.matches(".settings-trigger"));
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true }),
  );
  await page.keyboard.press("Meta+Comma");
  assert.equal(await dialog.isVisible(), true, "Mac shortcut opens settings");
  await page.getByRole("textbox", { name: "Plane palette name" }).fill("Unsaved palette");
  await page.keyboard.press("Meta+Comma");
  assert.equal(await dialog.isVisible(), true, "Shortcut is safe while settings are open");
  await page.mouse.move(bounds.x + 3, bounds.y + 3);
  await page.mouse.down();
  await page.mouse.move(2, 2);
  await page.mouse.up();
  assert.equal(
    await dialog.isVisible(),
    true,
    "Dragging from the dialog onto the backdrop keeps it open",
  );
  await page.mouse.click(2, 2);
  assert.equal(await dialog.isVisible(), false, "Backdrop dismisses settings");
  await trigger.click();
  await page.setViewportSize({ width: 390, height: 700 });
  assert.equal(
    await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
    true,
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(await dialog.isVisible(), false);
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.evaluate(() => delete navigator.platform);
}

async function opacitySettingsRoute(page) {
  await reset(page);
  await orient(page, [0, 0, 1]);
  const open = () => page.getByRole("button", { name: "Application settings" }).click();
  const done = () => page.getByRole("button", { name: "Done", exact: true }).click();
  const slider = (title) => page.getByRole("slider", { name: title, exact: true });
  await open();
  assert.equal(await slider("Canonical planes opacity").count(), 0);
  assert.equal(await slider("Grid opacity").inputValue(), "40");
  await slider("Grid opacity").press("End");
  await done();
  await settled(page);
  const state = await inspect(page);
  assert.ok(state.planeTargets.every((p) => p.fillOpacity === 0));
  assert.equal(
    state.planeTargets.find((p) => p.id === "XY").selectable,
    true,
    "Visible grid permits picking with zero fill",
  );
  await page.reload();
  await settled(page);
  await open();
  assert.equal(await slider("Grid opacity").inputValue(), "100");
  await slider("Grid opacity").press("Home");
  await done();
  await settled(page);
  assert.ok(
    (await inspect(page)).planeTargets.every((p) => !p.selectable),
    "Invisible fill and grid never intercept input",
  );
  await open();
}

async function migrationRoute(page) {
  await page.evaluate(() => {
    localStorage.removeItem("makeshift.plane-grids-version");
    localStorage.setItem(
      "makeshift.canonical-planes",
      JSON.stringify({
        angleCutoff: 0.25,
        fadeWidth: 0.4,
        colors: { XY: "#8fa8c4", XZ: "#123456", YZ: "#c2a27b" },
        palettes: { Kept: { XY: "#123456", XZ: "#123456", YZ: "#123456" } },
      }),
    );
  });
  await page.reload();
  await settled(page);
  await page.getByRole("button", { name: "Application settings" }).click();
  assert.equal(await page.getByLabel("XY plane color", { exact: true }).inputValue(), "#d4ae3a");
  assert.equal(await page.getByLabel("XZ plane color", { exact: true }).inputValue(), "#123456");
  await page.getByRole("combobox", { name: "Saved plane palette" }).selectOption("Kept");
  await page.getByRole("button", { name: "Delete palette" }).click();
  await page.getByRole("button", { name: "Reset plane grids" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await orient(page, [0.9, 0.4, Math.sqrt(0.03)]);
  assert.deepEqual(
    (await inspect(page)).planeTargets.filter((p) => p.selectable).map((p) => p.id),
    ["YZ"],
  );
}
