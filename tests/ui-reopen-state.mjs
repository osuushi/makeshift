import { inspect } from "./ui-helpers.mjs";
export async function completed(page) {
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return (
      !state.busy &&
      state.interaction === null &&
      state.commands.every((command) => command.unavailable !== "Switching tools…")
    );
  });
  return inspect(page);
}
export async function ready(page, accept) {
  if (accept)
    await page.waitForFunction((name) => {
      const state = window.makeshiftInspect();
      const button = Array.from(document.querySelectorAll("button")).find(
        (button) => button.getAttribute("aria-label") === name && !button.closest("[hidden]"),
      );
      return !state.busy && !!state.preview && button && !button.disabled;
    }, accept);
  return inspect(page);
}
