import assert from "node:assert/strict";
import { settingsSurface } from "./settings-surface.mjs";

// A native close event precedes destruction. An opener in that interval must
// create a live window; bounds/unit tests cannot exercise this singleton lifetime.
export async function reopenDuringSettingsClose(app, page, dialog) {
  await app.evaluate(({ BrowserWindow }) => {
    const require = process
      .getBuiltinModule("module")
      .createRequire(`${process.cwd()}/package.json`);
    const { openSettingsWindow } = require("./.build/host/host/settings-window.js");
    const window = BrowserWindow.getAllWindows().find(
      (window) => window.getTitle() === "Settings — Makeshift",
    );
    window.once("close", () => void openSettingsWindow(`${process.cwd()}/.build/host`, []));
  });
  const opening = app.waitForEvent("window");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const replacementPage = await opening;
  await replacementPage.waitForURL("**/settings.html");
  const replacement = await settingsSurface(page, "Interface");
  assert.notEqual(replacement.page(), dialog.page());
  await Promise.all([
    replacementPage.waitForEvent("close"),
    replacement
      .getByRole("button", { name: "Done", exact: true })
      .click()
      .catch((error) => {
        if (!replacementPage.isClosed()) throw error;
      }),
  ]);
}
