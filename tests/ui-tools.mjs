const standardShortcuts = {
  undo: "Meta+z",
  redo: "Meta+Shift+z",
  new: "Meta+n",
  open: "Meta+o",
  save: "Meta+s",
  "save-as": "Meta+Shift+s",
  close: "Meta+w",
  delete: "Delete",
  "select-all-entities": "Meta+a",
};

/** Invoke real Tools entries or ordinary standard shortcuts, never a hidden edit path. */
export async function chooseTool(page, query, id) {
  if (standardShortcuts[id]) {
    if (await page.getByRole("dialog", { name: "Find a tool" }).isVisible())
      await page.keyboard.press("Escape");
    // Leave text editing so Undo/Delete apply to geometry, including committed modal parameters.
    const trigger = page.getByRole("button", { name: "Tools", exact: true });
    await trigger.focus();
    await page.waitForFunction(() => {
      const state = window.makeshiftInspect();
      return (
        !state.busy && state.commands.every((command) => command.unavailable !== "Switching tools…")
      );
    });
    await trigger.press(standardShortcuts[id]);
    // File helpers answer native/file/unsaved prompts before their command can complete.
    await page.waitForFunction((id) => {
      const state = window.makeshiftInspect();
      return (
        !state.busy &&
        (["new", "open", "save", "save-as", "close"].includes(id) ||
          state.commands.every((command) => command.unavailable !== "Switching tools…"))
      );
    }, id);
    return;
  }
  await openTools(page);
  await page.getByRole("combobox", { name: "Find a tool" }).fill(query);
  const row = page.locator(`[data-command="${id}"]`);
  // Locator actionability waits through transient tool closure/calculation updates.
  await row.click();
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return (
      !state.busy && state.commands.every((command) => command.unavailable !== "Switching tools…")
    );
  });
}

export async function browseTools(page, category) {
  await openTools(page);
  await page.getByRole("combobox", { name: "Find a tool" }).fill("");
  const back = page.locator(".tool-menu-back");
  if (await back.isVisible()) await back.click();
  await page
    .getByRole("option", { name: category, exact: true })
    .and(page.locator(`[data-command="${category}"]`))
    .click();
}

export async function toolEnabled(page, query, id) {
  await openTools(page);
  await page.getByRole("combobox", { name: "Find a tool" }).fill(query);
  const enabled = standardShortcuts[id]
    ? await page.evaluate(
        (id) =>
          window.makeshiftInspect().commands.find((command) => command.id === id)?.unavailable ===
          null,
        id,
      )
    : (await page.locator(`[data-command="${id}"]`).getAttribute("aria-disabled")) === "false";
  await page.keyboard.press("Escape");
  return enabled;
}

async function openTools(page) {
  if (await page.locator(".agent-dock:focus-within").count())
    await page.getByRole("button", { name: "Tools", exact: true }).click();
  else await page.keyboard.press("Meta+f");
}
