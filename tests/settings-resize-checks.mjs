import assert from "node:assert/strict";

// Cross-process sizing is applied once by a real tab click. Native limits own
// manual resize constraints; no renderer observer may reset the resulting size.
export async function settingsResizeChecks(app, page, dialog) {
  const names = [
    ["Interface", 250],
    ["Sketch Grid", 400],
    ["View", 620],
    ["Decorators", 660],
    ["Experimental", 300],
    ["Toolbox", 720],
  ];
  for (const [name, height] of names) {
    await dialog.getByRole("tab", { name, exact: true }).click();
    await page.waitForFunction((height) => innerHeight === height && innerWidth === 760, height);
    const preferred = await nativeState(app);
    assert.ok(
      preferred.min[0] <= preferred.bounds.width && preferred.bounds.width <= preferred.max[0],
    );
    assert.ok(
      preferred.min[1] <= preferred.bounds.height && preferred.bounds.height <= preferred.max[1],
    );
    if (name === "Toolbox") {
      const tree = await dialog.locator(".toolbox-settings-tree").boundingBox();
      assert.ok(tree.height >= 400, JSON.stringify(tree));
      await page.screenshot({ path: ".cache/sketch-review/settings-toolbox-stable.png" });
    }
    for (const size of [preferred.min, preferred.max]) {
      await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()
          .find((window) => window.getTitle() === "Settings — Makeshift")
          .setSize(...size);
      }, size);
      await page.waitForFunction((size) => outerWidth === size[0] && outerHeight === size[1], size);
      await frames(page);
      if (name === "Interface") {
        const appearance = await dialog.getByRole("combobox", { name: "Appearance" }).boundingBox();
        const done = await dialog.getByRole("button", { name: "Done", exact: true }).boundingBox();
        assert.ok(
          appearance.y + appearance.height <= done.y,
          "Native minimum leaves room for Interface controls above Done",
        );
      }
      const actual = await nativeState(app);
      assert.deepEqual(
        [actual.bounds.width, actual.bounds.height],
        size,
        `${name} retains manual resizing to its native limit`,
      );
      await dialog.getByRole("tab", { name, exact: true }).click();
      await frames(page);
      assert.deepEqual(
        (await nativeState(app)).bounds,
        actual.bounds,
        "Clicking the already-selected tab does not grab sizing back",
      );
    }
    if (name === "Interface") {
      const row = await dialog.locator(".settings-interface").boundingBox();
      const panel = await dialog.getByRole("tabpanel", { name, exact: true }).boundingBox();
      assert.ok(row.y - panel.y < 2, "Interface controls stay at the top when enlarged");
      assert.ok(row.height < 100, "Interface row keeps its natural height");
      await page.screenshot({ path: ".cache/sketch-review/settings-interface-max.png" });
    }
  }
  await dialog.getByRole("tab", { name: "Interface", exact: true }).click();
  await page.waitForFunction(() => innerHeight === 250 && innerWidth === 760);
  await page.screenshot({ path: ".cache/sketch-review/settings-interface-preferred.png" });
  console.log(
    "Native Settings: per-tab preferred/min/max, stable manual resizing and top-aligned Interface passed",
  );
}
async function nativeState(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(
      (window) => window.getTitle() === "Settings — Makeshift",
    );
    return {
      bounds: window.getBounds(),
      min: window.getMinimumSize(),
      max: window.getMaximumSize(),
    };
  });
}
async function frames(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
}

export async function settingsScaleChecks(page, dialog) {
  const scale = dialog.getByRole("combobox", { name: "User interface scale" });
  for (const [value, width, height] of [
    [0.8, 608, 200],
    [1.5, 1140, 375],
    [1, 760, 250],
  ]) {
    await scale.selectOption(String(value));
    await page.waitForFunction(
      ({ width, height }) => innerWidth === width && innerHeight === height,
      { width, height },
    );
    const appearance = await dialog.getByRole("combobox", { name: "Appearance" }).boundingBox();
    const done = await dialog.getByRole("button", { name: "Done", exact: true }).boundingBox();
    assert.ok(
      appearance.y + appearance.height <= done.y,
      `Interface controls fit the preferred size at ${value * 100}%`,
    );
  }
}
