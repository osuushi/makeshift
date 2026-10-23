import assert from "node:assert/strict";
import { launchElectron } from "./native-documents.mjs";
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
  await dialog.getByRole("combobox", { name: "User interface scale" }).selectOption("1.5");
  await page.waitForFunction(
    () => document.documentElement.style.getPropertyValue("--ui-scale") === "1.5",
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
  await dialog.getByRole("checkbox", { name: "Fast trim checks" }).check();
  await page.waitForFunction(() => localStorage.getItem("makeshift.fast-trim-checks") === "true");
  await dialog.getByRole("tab", { name: "View", exact: true }).click();
  await dialog.getByRole("slider", { name: "Grid opacity", exact: true }).press("End");
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("makeshift.view-display")).grid === 1,
  );
  await dialog.getByRole("tab", { name: "Decorators", exact: true }).click();
  await dialog.getByRole("combobox").selectOption("color-only");
  await settings.screenshot({ path: ".cache/sketch-review/settings-window.png" });
  await Promise.all([settings.waitForEvent("close"), settings.keyboard.press("Escape")]);
  await page.getByRole("button", { name: "Application settings" }).click();
  const reopened = await settingsSurface(page, "Interface");
  assert.equal(
    await reopened.getByRole("combobox", { name: "User interface scale" }).inputValue(),
    "1.5",
  );
  await reopened.getByRole("button", { name: "Reset to 100%" }).click();
  await reopened.getByRole("button", { name: "Done", exact: true }).click();
  console.log(
    "Native settings: separate singleton, keyboard tabs, live scale/storage, close/reopen and persistence passed",
  );
} finally {
  await app.close();
}
