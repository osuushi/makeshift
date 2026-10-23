import assert from "node:assert/strict";
import { launchElectron } from "./native-documents.mjs";
import { reopenDuringSettingsClose } from "./settings-close-checks.mjs";
import {
  settingsResizeChecks,
  settingsScaleChecks,
  settingsSmallDisplayChecks,
} from "./settings-resize-checks.mjs";
import { settingsSurface } from "./settings-surface.mjs";
import { settled } from "./ui-helpers.mjs";

// Storage cache propagation and singleton BrowserWindow routing require real renderers.
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  await settled(page);
  await page.getByRole("button", { name: "Application settings" }).click();
  const dialog = await settingsSurface(page, "Interface");
  const settings = page
    .context()
    .pages()
    .find((p) => p.url().includes("/settings.html"));
  assert.ok(settings);
  assert.equal(await page.locator("dialog.application-settings[open]").count(), 0);
  await page.getByRole("button", { name: "Application settings" }).click();
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 2);
  await settingsResizeChecks(app, settings, dialog);
  await settingsScaleChecks(app, settings, dialog);
  await settingsSmallDisplayChecks(app, settings, dialog);
  // Theme storage must reach both the new Settings renderer and the drawing.
  const appearance = dialog.getByRole("combobox", { name: "Appearance" });
  for (const theme of ["dark", "light"]) {
    await appearance.selectOption(theme);
    await page.waitForFunction((value) => document.documentElement.dataset.theme === value, theme);
    await settings.waitForFunction(
      (value) => document.documentElement.dataset.theme === value,
      theme,
    );
  }
  const sizeBeforeScale = await settings.evaluate(() => [outerWidth, outerHeight]);
  await dialog.getByRole("combobox", { name: "User interface scale" }).selectOption("1.5");
  await page.waitForFunction(
    () => document.documentElement.style.getPropertyValue("--ui-scale") === "1.5",
  );
  await settings.waitForFunction((height) => outerHeight > height, sizeBeforeScale[1]);
  assert.ok(
    (await settings.evaluate(() => outerHeight)) > sizeBeforeScale[1],
    "An explicit interface-scale change applies the pane's scaled native policy once",
  );
  await dialog.getByRole("tab", { name: "Interface", exact: true }).focus();
  await settings.keyboard.press("ArrowRight");
  assert.equal(
    await dialog
      .getByRole("tab", { name: "Sketch Grid", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await settings.keyboard.press("End");
  assert.equal(
    await dialog.getByRole("tab", { name: "Toolbox", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  await dialog.getByRole("tab", { name: "Experimental", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Fast trim checks" }).check();
  await page.waitForFunction(() => localStorage.getItem("makeshift.fast-trim-checks") === "true");
  // A tab's preferred placement is clamped to the display, including at the bottom.
  await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(
      (window) => window.getTitle() === "Settings — Makeshift",
    );
    const bounds = window.getBounds();
    const work = screen.getDisplayMatching(bounds).workArea;
    window.setPosition(work.x + work.width - bounds.width, work.y + work.height - bounds.height);
  });
  await dialog.getByRole("tab", { name: "View", exact: true }).click();
  await settings.waitForFunction(() => document.querySelector('[aria-label="Grid opacity"]'));
  await settings.waitForFunction(() => {
    const tabs = document.querySelector(".settings-tabs");
    return tabs.scrollWidth <= tabs.clientWidth;
  });
  await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(
      (window) => window.getTitle() === "Settings — Makeshift",
    );
    const bounds = window.getBounds(),
      work = screen.getDisplayMatching(bounds).workArea;
    if (bounds.y < work.y || bounds.y + bounds.height > work.y + work.height)
      throw new Error(`Settings outside work area: ${JSON.stringify({ bounds, work })}`);
  });
  await settings.screenshot({ path: ".cache/sketch-review/settings-view-compact.png" });

  await dialog.getByRole("checkbox", { name: "Global X-ray vision" }).check();
  assert.equal(await dialog.getByRole("slider", { name: "Bleed", exact: true }).isDisabled(), true);
  await dialog.getByRole("checkbox", { name: "Global X-ray vision" }).uncheck();
  assert.equal(
    await dialog.getByRole("slider", { name: "Bleed", exact: true }).isDisabled(),
    false,
  );
  await dialog.getByRole("slider", { name: "Grid opacity", exact: true }).press("End");
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("makeshift.view-display")).grid === 1,
  );
  await dialog.getByRole("tab", { name: "Decorators", exact: true }).click();
  await dialog.getByRole("combobox").selectOption("color-only");
  await settings.screenshot({ path: ".cache/sketch-review/settings-window.png" });
  await Promise.all([
    settings.waitForEvent("close"),
    settings.keyboard.press("Escape").catch((error) => {
      if (!settings.isClosed()) throw error;
    }),
  ]);
  await page.getByRole("button", { name: "Application settings" }).click();
  const reopened = await settingsSurface(page, "Interface");
  assert.equal(
    await reopened.getByRole("combobox", { name: "User interface scale" }).inputValue(),
    "1.5",
  );
  await reopened.getByRole("button", { name: "Reset to 100%" }).click();
  await reopenDuringSettingsClose(app, page, reopened);
  // Native popover Tab/Escape must reach browser defaults instead of CAD shortcuts.
  await page.getByRole("button", { name: "View options", exact: false }).click();
  const grid = page.getByRole("dialog", { name: "View options", exact: true });
  const minor = grid.getByLabel("Minor grid (mm)", { exact: true });
  await minor.focus();
  await minor.press("Tab");
  assert.equal(await grid.evaluate((panel) => panel.contains(document.activeElement)), true);
  await minor.fill("2");
  await minor.press("Tab");
  await settled(page);
  await page.keyboard.press("Escape");
  await grid.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "View options", exact: false }).click();
  assert.equal(await minor.inputValue(), "2");
  await grid.getByRole("button", { name: "Done", exact: true }).click();
  console.log(
    "Native settings: separate singleton, keyboard tabs, live scale/storage, close/reopen and persistence passed",
  );
} finally {
  await app.close();
}
