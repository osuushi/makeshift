/** Settings lives in a dedicated native window and in the document on web. */
export async function settingsSurface(page, tab) {
  let surface = page;
  if (await page.evaluate(() => !!window.makeshiftSettings)) {
    for (let attempt = 0; attempt < 200; attempt++) {
      surface = page
        .context()
        .pages()
        .find((candidate) => candidate.url().includes("/settings.html"));
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
