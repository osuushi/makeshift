import assert from "node:assert/strict";

// Runtime text/layout measurements cross the renderer/native boundary once per
// tab. Only the tree benefits from manual resizing; ordinary controls must fit.
export async function settingsResizeChecks(app, page, dialog) {
  for (const name of [
    "Interface",
    "Sketch Grid",
    "View",
    "Decorators",
    "Experimental",
    "Toolbox",
  ]) {
    await dialog.getByRole("tab", { name, exact: true }).click();
    await frames(page);
    const state = await nativeState(app);
    if (name === "Toolbox") {
      assert.equal(state.resizable, true);
      const tree = await dialog.locator(".toolbox-settings-tree").boundingBox();
      assert.ok(tree.height >= 300, JSON.stringify(tree));
      await page.screenshot({ path: ".cache/sketch-review/settings-toolbox-measured.png" });
      await checkTreeResizing(app, page, dialog, state);
    } else {
      assert.equal(state.resizable, false, `${name} has no unnecessary resize affordance`);
      assert.deepEqual(state.min, state.max, `${name} is fixed to its measured content`);
      await assertPaneFits(page, dialog, name, state);
    }
  }
  await dialog.getByRole("tab", { name: "Interface", exact: true }).click();
  await frames(page);
  const row = await dialog.locator(".settings-interface").boundingBox();
  const panel = await dialog
    .getByRole("tabpanel", { name: "Interface", exact: true })
    .boundingBox();
  assert.ok(
    row.y - panel.y < 2 && panel.height - row.height < 8,
    "Interface has no artificial vertical space around its control row",
  );
  await page.screenshot({ path: ".cache/sketch-review/settings-interface-measured.png" });
  console.log(
    "Native Settings: measured fixed panes fit without scrollbars; Toolbox keeps useful native resize limits",
  );
}
async function checkTreeResizing(app, page, dialog, preferred) {
  for (const size of [preferred.min, preferred.max]) {
    await app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === "Settings — Makeshift")
        .setSize(...size);
    }, size);
    await frames(page);
    const actual = await nativeState(app);
    assert.deepEqual([actual.bounds.width, actual.bounds.height], size);
    await dialog.getByRole("tab", { name: "Toolbox", exact: true }).click();
    await frames(page);
    assert.deepEqual(
      (await nativeState(app)).bounds,
      actual.bounds,
      "Clicking the current tab does not grab manual size back",
    );
  }
}
async function assertPaneFits(page, dialog, name, state) {
  const fits = await dialog.getByRole("tabpanel", { name, exact: true }).evaluate((panel) => ({
    vertical: panel.scrollHeight - panel.clientHeight,
    horizontal: panel.scrollWidth - panel.clientWidth,
  }));
  assert.ok(fits.horizontal <= 1, `${name} horizontal overflow: ${JSON.stringify(fits)}`);
  if (state.bounds.height < state.work.height)
    assert.ok(fits.vertical <= 1, `${name} unnecessary scrollbar: ${JSON.stringify(fits)}`);
  assert.equal(
    await page.locator(".settings-measure").count(),
    0,
    "Measurement copies are removed",
  );
}
async function nativeState(app) {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(
      (window) => window.getTitle() === "Settings — Makeshift",
    );
    return {
      bounds: window.getBounds(),
      min: window.getMinimumSize(),
      max: window.getMaximumSize(),
      resizable: window.isResizable(),
      work: screen.getDisplayMatching(window.getBounds()).workArea,
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
export async function settingsScaleChecks(app, page, dialog) {
  for (const value of [0.8, 1.5, 1]) {
    await dialog
      .getByRole("combobox", { name: "User interface scale" })
      .selectOption(String(value));
    await frames(page);
    await assertPaneFits(page, dialog, "Interface", await nativeState(app));
    for (const name of ["Sketch Grid", "View", "Decorators", "Experimental"]) {
      await dialog.getByRole("tab", { name, exact: true }).click();
      await frames(page);
      await assertPaneFits(page, dialog, name, await nativeState(app));
    }
    await dialog.getByRole("tab", { name: "Interface", exact: true }).click();
    await frames(page);
  }
}

// A small work area is emulated; native sizing still runs through real IPC.
export async function settingsSmallDisplayChecks(app, page, dialog) {
  await app.evaluate(({ screen }) => {
    screen.originalDisplayMatching = screen.getDisplayMatching;
    screen.getDisplayMatching = (bounds) => ({
      ...screen.originalDisplayMatching(bounds),
      workArea: { x: 0, y: 38, width: 1280, height: 682 },
    });
  });
  try {
    for (const scale of [1, 1.5]) {
      await dialog
        .getByRole("combobox", { name: "User interface scale" })
        .selectOption(String(scale));
      await frames(page);
      for (const name of ["Interface", "Sketch Grid", "View", "Decorators", "Experimental"]) {
        await dialog.getByRole("tab", { name, exact: true }).click();
        await frames(page);
        const state = await nativeState(app);
        assert.ok(
          state.bounds.width <= state.work.width && state.bounds.height <= state.work.height,
        );
        await assertPaneFits(page, dialog, name, state);
      }
      await dialog.getByRole("tab", { name: "Interface", exact: true }).click();
      await frames(page);
    }
  } finally {
    await app.evaluate(({ screen }) => {
      screen.getDisplayMatching = screen.originalDisplayMatching;
      delete screen.originalDisplayMatching;
    });
  }
  await dialog.getByRole("combobox", { name: "User interface scale" }).selectOption("1");
  await frames(page);
  console.log("Native Settings: runtime measurements fit an emulated 1280×720 display at 100/150%");
}
