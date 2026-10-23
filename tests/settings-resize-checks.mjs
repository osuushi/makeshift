import assert from "node:assert/strict";

// A native resize changes renderer layout; an observer-driven IPC resize can then
// overwrite it. CSS/unit tests cannot catch that feedback across the host boundary.
export async function settingsResizeChecks(app, page, dialog) {
  const initial = await bounds(app);
  assert.ok(initial.width >= 720 && initial.height >= 640, JSON.stringify(initial));
  await dialog.getByRole("tab", { name: "Toolbox", exact: true }).click();
  await frames(page);
  assert.deepEqual(await bounds(app), initial, "Toolbox keeps the useful initial window size");
  const tree = await dialog.locator(".toolbox-settings-tree").boundingBox();
  assert.ok(tree.height >= 400, `Toolbox uses available window space: ${JSON.stringify(tree)}`);
  await page.screenshot({ path: ".cache/sketch-review/settings-toolbox-stable.png" });
  const names = ["Interface", "Sketch Grid", "View", "Decorators", "Experimental", "Toolbox"];
  for (const name of names) {
    const before = await bounds(app);
    await dialog.getByRole("tab", { name, exact: true }).click();
    await frames(page);
    assert.deepEqual(await bounds(app), before, `${name} does not resize the window`);
    for (const [width, height] of [
      [620, 480],
      [800, 700],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()
            .find((window) => window.getTitle() === "Settings — Makeshift")
            .setContentSize(size.width, size.height);
        },
        { width, height },
      );
      await page.waitForFunction(
        (size) => innerWidth === size.width && innerHeight === size.height,
        { width, height },
      );
      await frames(page);
      const size = await page.evaluate(() => [innerWidth, innerHeight]);
      assert.deepEqual(size, [width, height], `${name} retains the requested manual size`);
    }
  }
  await dialog.getByRole("tab", { name: "Interface", exact: true }).click();
  console.log("Native Settings: six tabs preserve manual resizes and Toolbox initial size");
}
async function bounds(app) {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.getTitle() === "Settings — Makeshift")
      .getBounds(),
  );
}
async function frames(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
}
