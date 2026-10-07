import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await opacitySettingsRoute(page);
    const open = () => page.getByRole("button", { name: "Application settings" }).click();
    const done = () => page.getByRole("button", { name: "Done", exact: true }).click();
    const slider = (title) => page.getByRole("slider", { name: title, exact: true });
    await page.getByRole("button", { name: "Reset viewport opacity" }).click();
    await page.getByRole("combobox", { name: "Plane visibility preset" }).selectOption("choice");
    assert.equal(await slider("Angle cutoff").inputValue(), "25");
    assert.equal(await slider("Angular fade width").inputValue(), "40");
    await slider("Minimum selectable visibility").press("End");
    await slider("Maximum preview visibility").press("Home");
    await slider("Fade time").press("Home");
    const color = page.getByLabel("XY plane color", { exact: true });
    await color.fill("#123456");
    await color.dispatchEvent("input");
    await page.getByRole("textbox", { name: "Plane palette name" }).fill("My planes");
    await page.getByRole("button", { name: "Save plane palette" }).click();
    await color.fill("#654321");
    await color.dispatchEvent("input");
    await page.getByRole("combobox", { name: "Saved plane palette" }).selectOption("My planes");
    assert.equal(await color.inputValue(), "#123456");
    await done();
    await page.reload();
    await settled(page);
    await open();
    assert.equal(await color.inputValue(), "#123456");
    assert.equal(await slider("Minimum selectable visibility").inputValue(), "100");
    assert.equal(await slider("Maximum preview visibility").inputValue(), "0");
    assert.equal(await slider("Fade time").inputValue(), "0");
    await page.getByRole("button", { name: "Reset plane visibility" }).click();
    assert.equal(await color.inputValue(), "#8fa8c4");
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
    assert.equal(xy.fillOpacity, 0.06);
    assert.equal(xy.selectable, true);
    assert.ok(
      state.planeTargets.filter((p) => p.id !== "XY").every((p) => !p.selectable && !p.visible),
    );
    await open();
    await page.getByRole("combobox", { name: "Saved plane palette" }).selectOption("My planes");
    await page.getByRole("button", { name: "Delete plane palette" }).click();
    assert.equal(
      await page.getByRole("combobox", { name: "Saved plane palette" }).locator("option").count(),
      1,
    );
    await page.getByRole("button", { name: "Reset plane visibility" }).click();
    await done();
    await page.screenshot({ path: `.cache/sketch-review/${name}-plane-visibility-settings.png` });
    console.log(
      `${name}: real Settings controls, renderer, thresholds, palettes, reload and reset passed`,
    );
  },
  { defaults: ["chromium", "webkit"] },
);

async function opacitySettingsRoute(page) {
  await reset(page);
  await orient(page, [0, 0, 1]);
  const open = () => page.getByRole("button", { name: "Application settings" }).click();
  const done = () => page.getByRole("button", { name: "Done", exact: true }).click();
  const slider = (title) => page.getByRole("slider", { name: title, exact: true });
  await open();
  assert.equal(await slider("Canonical planes opacity").inputValue(), "6");
  assert.equal(await slider("Grid opacity").inputValue(), "40");
  await slider("Canonical planes opacity").press("Home");
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
  assert.equal(await slider("Canonical planes opacity").inputValue(), "0");
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
