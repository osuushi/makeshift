import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { orient } from "./ui-blend-edit.mjs";
import { openThreadAdvanced } from "./ui-decorator-advanced.mjs";
import { holdPreviews, previewReady, previewStats } from "./ui-decorator-worker-control.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { exportGear } from "./ui-gear-export.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function displaySettings(page, change) {
  await page.getByRole("button", { name: "Application settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await change(dialog);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}
export async function createDecoratedCylinder(page, kind = "threads") {
  await reset(page);
  await displaySettings(page, (dialog) =>
    dialog.getByRole("button", { name: "Reset decorator display" }).click(),
  );
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -8, 5]);
  await chooseTool(page, kind, kind);
  await previewReady(page);
}
export async function contrastRoute(page, name, kind) {
  await createDecoratedCylinder(page, kind);
  const original = (await inspect(page)).document.bodies[0];
  const variants = kind === "threads" ? ["rod", "hole"] : ["gear"];
  for (const variant of variants) {
    if (kind === "threads") {
      await worldClick(page, [0, -8, 5]);
      await page.getByRole("combobox", { name: "Cut into", exact: true }).selectOption(variant);
      await previewReady(page);
    }
    for (const [view, direction] of [
      ["front", [0, -1, 0.3]],
      ["oblique", [1, -1, 0.55]],
      ["top", [0, -0.25, 1]],
    ]) {
      await clearSelection(page);
      await orient(page, direction);
      await page.mouse.move(100, 70);
      await page.screenshot({
        path: `.cache/sketch-review/${name}-${kind}-${variant}-${view}-default.png`,
      });
    }
    await orient(page, [0, -1, 0.3]);
    for (const opacity of ["20", "100"]) {
      await displaySettings(page, (dialog) =>
        dialog
          .getByRole("slider", {
            name: kind === "threads" ? "Threads preview opacity" : "Gears preview opacity",
          })
          .press(opacity === "20" ? "Home" : "End"),
      );
      await page.screenshot({
        path: `.cache/sketch-review/${name}-${kind}-${variant}-opacity-${opacity}.png`,
      });
    }
    await displaySettings(page, (dialog) =>
      dialog.getByRole("button", { name: "Reset decorator display" }).click(),
    );
    await worldClick(page, [0, -8, 5]);
    assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
    assert.deepEqual((await inspect(page)).document.bodies[0], original);
  }
}
export async function delayedMoveRoute(page, name) {
  await createDecoratedCylinder(page);
  const before = (await inspect(page)).document;
  const original = (await inspect(page)).decoratorPreviewBounds[0];
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await holdPreviews(page);
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("5");
  await inspect(page);
  await page.waitForFunction(() => window.previewTest.replies.length > 0);
  let state = await inspect(page);
  assert.equal(
    state.decoratorPreviewBounds.length,
    0,
    "Wrong-placement meshes are removed immediately",
  );
  assert.ok(
    Math.abs(state.decoratorFallbackBounds[0].min[0] - (before.bodies[0].bounds[0] + 5)) < 0.02,
  );
  await page
    .getByRole("status")
    .filter({ hasText: "Updating decorator previews" })
    .waitFor({ state: "visible" });
  await page.screenshot({ path: `.cache/sketch-review/${name}-thread-moving-fallback.png` });
  await page.locator(".body-transform-value").fill("8");
  state = await inspect(page);
  assert.ok(
    Math.abs(state.decoratorFallbackBounds[0].min[0] - (before.bodies[0].bounds[0] + 8)) < 0.02,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  const cancelled = await inspect(page);
  assert.ok(
    Math.abs(cancelled.decoratorFallbackBounds[0].min[0] - before.bodies[0].bounds[0]) < 0.02,
    "Cancellation immediately restores the marker to the accepted face",
  );
  await holdPreviews(page, false);
  await previewReady(page);
  state = await inspect(page);
  assert.ok(Math.abs(state.decoratorPreviewBounds[0].min[0] - original.min[0]) < 0.02);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await holdPreviews(page);
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("4");
  await inspect(page);
  await page.keyboard.press("Enter");
  assert.notDeepEqual((await inspect(page)).document, before);
  await holdPreviews(page, false);
  await previewReady(page);
  await chooseTool(page, "undo", "undo");
  await previewReady(page);
  assert.deepEqual((await inspect(page)).document, before);
}
export async function delayedSettingsRoute(page, name) {
  await clearSelection(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -8, 5]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await openThreadAdvanced(page);
  const before = (await inspect(page)).document;
  const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
  await holdPreviews(page);
  await pitch.fill("1.5");
  await inspect(page);
  await page.waitForFunction(() => window.previewTest.replies.length > 0);
  assert.ok((await inspect(page)).decoratorFallbackBounds.length);
  await pitch.fill("2");
  await pitch.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await holdPreviews(page, false);
  await previewReady(page);
  await pitch.fill("1.5");
  await pitch.press("Enter");
  await previewReady(page);
  assert.equal((await inspect(page)).document.decorators[0].settings.pitch, 1.5);
  await chooseTool(page, "undo", "undo");
  await previewReady(page);
  assert.deepEqual((await inspect(page)).document, before);
  await page.screenshot({ path: `.cache/sketch-review/${name}-thread-final-detail.png` });
}
export async function coarseWhileSettledRoute(page, name) {
  const before = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.evaluate(() => {
    window.previewTest.holdSettled = true;
  });
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("5");
  await inspect(page);
  await page.waitForFunction(
    () =>
      window.previewTest.replies.length > 0 &&
      window.makeshiftInspect().decoratorPreviewBounds.length > 0,
  );
  const coarse = (await inspect(page)).decoratorPreviewBounds[0];
  assert.equal(
    (await inspect(page)).decoratorFallbackBounds.length,
    0,
    "A matching coarse mesh replaces the attachment marker",
  );
  await page
    .getByRole("status")
    .filter({ hasText: "Updating decorator previews" })
    .waitFor({ state: "visible" });
  await page.screenshot({ path: `.cache/sketch-review/${name}-thread-coarse-pending-settled.png` });
  await holdPreviews(page, false);
  await previewReady(page);
  const final = (await inspect(page)).decoratorPreviewBounds[0];
  assert.ok(final.triangles > coarse.triangles, "Settled generation restores full preview quality");
  await page.keyboard.press("Escape");
  await previewReady(page);
  assert.deepEqual((await inspect(page)).document, before);
}

export async function colorOnlyRoute(page, name, app) {
  const before = (await inspect(page)).document;
  await exportGear(page, `${name}-detailed-export`, app, "stl");
  await holdPreviews(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("5");
  await inspect(page);
  await page.waitForFunction(() => window.previewTest.replies.length > 0);
  await page.keyboard.press("Escape");
  const history = await page.evaluate(() => window.makeshiftHistory());
  await displaySettings(page, async (dialog) => {
    await dialog
      .getByRole("combobox", { name: "Decorator preview detail" })
      .selectOption("color-only");
    await dialog.getByLabel("Threads preview hex color").fill("#a43d71");
  });
  assert.deepEqual(await page.evaluate(() => window.makeshiftHistory()), history);
  const baseline = await previewStats(page);
  await holdPreviews(page, false);
  assert.equal((await inspect(page)).decoratorPreviewBounds.length, 0);
  assert.ok((await inspect(page)).decoratorFallbackBounds.length);
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  assert.equal((await inspect(page)).decoratorFallbackBounds.length, 0);
  await page.getByRole("button", { name: "Show Body 1", exact: true }).click();
  assert.ok((await inspect(page)).decoratorFallbackBounds.length);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("4");
  await inspect(page);
  assert.ok((await inspect(page)).decoratorFallbackBounds.length);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  assert.equal(
    (await previewStats(page)).posts,
    baseline.posts,
    "Color only schedules no expensive preview jobs",
  );
  assert.deepEqual((await inspect(page)).document, before);
  await page.screenshot({ path: `.cache/sketch-review/${name}-thread-color-only.png` });
  await exportGear(page, `${name}-color-only-export`, app, "stl");
  assert.deepEqual(
    await readFile(`.cache/sketch-review/${name}-color-only-export.stl`),
    await readFile(`.cache/sketch-review/${name}-detailed-export.stl`),
    "Display preferences leave final exported triangles unchanged",
  );
  await page.reload();
  await inspect(page);
  await displaySettings(page, async (dialog) => {
    assert.equal(
      await dialog.getByRole("combobox", { name: "Decorator preview detail" }).inputValue(),
      "color-only",
    );
    assert.equal(await dialog.getByLabel("Threads preview color").inputValue(), "#a43d71");
    await dialog.getByRole("button", { name: "Reset decorator display" }).click();
  });
}
