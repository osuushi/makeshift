/** Settings lives in a dedicated native window and in the document on web. */
export async function settingsSurface(page, tab) {
  let surface = page;
  if (await page.evaluate(() => !!window.makeshiftSettings)) {
    surface = undefined;
    for (let attempt = 0; attempt < 200; attempt++) {
      // The previous native window can remain in Playwright's page inventory
      // after Done closes its dialog. Select the new open dialog, not its URL.
      for (const candidate of page.context().pages()) {
        if (!candidate.url().includes("/settings.html") || candidate.isClosed()) continue;
        const open = await candidate
          .getByRole("dialog", { name: "Settings", exact: true })
          .isVisible()
          .catch((error) => {
            if (!candidate.isClosed()) throw error;
            return false;
          });
        if (open) {
          surface = candidate;
          break;
        }
      }
      if (surface) break;
      await page.waitForTimeout(25);
    }
    if (!surface) throw new Error("Settings window did not open");
  }
  const dialog = surface.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.waitFor();
  if (tab) await dialog.getByRole("tab", { name: tab, exact: true }).click();
  return dialog;
}

/** A native Done click destroys its Page before Chromium may acknowledge it. */
export async function closeSettings(dialog) {
  const page = dialog.page();
  const native = await page.evaluate(() => !!window.makeshiftSettingsWindow);
  const closed = native ? page.waitForEvent("close") : dialog.waitFor({ state: "hidden" });
  await Promise.all([
    closed,
    dialog
      .getByRole("button", { name: "Done", exact: true })
      .click()
      .catch((error) => {
        if (
          !native ||
          !page.isClosed() ||
          !error.message.includes("Target page, context or browser has been closed")
        )
          throw error;
      }),
  ]);
}
