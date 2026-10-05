import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { modalMoveHistory } from "./ui-modal-move-history.mjs";
import { cancelModalAxisGesture, modalPointerHistory } from "./ui-modal-pointer-history.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function checkpoint(page, input, value) {
  await input.fill(String(value));
  await inspect(page);
  if ((await input.getAttribute("aria-label")) === "Shell thickness")
    await page.locator(".shell-widget small").click();
  else await input.press("Enter");
  return inspect(page);
}
async function history(page, redo = false) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".commit-cleanup")].every(
      (button) => !button.getClientRects().length || button.getAttribute("aria-busy") !== "true",
    ),
  );
  await page.keyboard.press(redo ? "Meta+Shift+z" : "Meta+z");
  return inspect(page);
}
await withUiRuntimes(
  async (page, name) => {
    const { center } = await plate(page);
    await page.mouse.click(center.x + 30, center.y + 30);
    const original = (await inspect(page)).document;
    await chooseTool(page, "shell", "shell");
    const shell = page.getByRole("textbox", { name: "Shell thickness", exact: true });
    await checkpoint(page, shell, -1);
    await checkpoint(page, shell, -2);
    let state = await history(page);
    assert.equal(state.interaction.kind, "shell");
    close(state.preview.bodies[0].volume, 1084);
    assert.deepEqual(state.document, original);
    state = await history(page);
    assert.ok(state.preview === null, "Undo returns to the initial preview");
    assert.deepEqual(state.document, original);
    state = await history(page, true);
    close(state.preview.bodies[0].volume, 1084);
    await checkpoint(page, shell, -3);
    state = await history(page, true);
    close(state.preview.bodies[0].volume, 4000 - 14 * 14 * 7);
    await page.getByRole("button", { name: "Accept shell", exact: true }).click();
    state = await inspect(page);
    const accepted = state.document;
    state = await history(page);
    assert.deepEqual(state.document, original);
    state = await history(page, true);
    assert.deepEqual(state.document, accepted);

    console.log(`${name}: Shell local history and grouped acceptance passed`);
    await history(page);
    await modalPointerHistory(page, center);
    await plate(page);
    await page.mouse.click(center.x + 30, center.y + 30);
    await page.keyboard.press("e");
    const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
    await checkpoint(page, distance, 2);
    const first = (await inspect(page)).preview.bodies[0].volume;
    await checkpoint(page, distance, 4);
    state = await history(page);
    close(state.preview.bodies[0].volume, first);
    state = await history(page);
    assert.ok(state.preview === null, "Undo returns to the initial preview");
    state = await history(page, true);
    close(state.preview.bodies[0].volume, first);
    const draft = page.getByRole("textbox", { name: "Draft value", exact: true });
    await checkpoint(page, draft, 5);
    const drafted = (await inspect(page)).preview.bodies[0].volume;
    assert.ok(Math.abs(drafted - first) > 1);
    state = await history(page);
    close(state.preview.bodies[0].volume, first);
    assert.equal(await draft.inputValue(), "0");
    state = await history(page, true);
    close(state.preview.bodies[0].volume, drafted);
    assert.equal(await draft.inputValue(), "5");
    await cancelModalAxisGesture(page);
    state = await history(page);
    close(state.preview.bodies[0].volume, first, "Cancelled axis drag creates no undo entry");
    await page.keyboard.press("Escape");
    await inspect(page);
    console.log(`${name}: Extrude distance/draft local history passed`);
    await modalMoveHistory(page);
    console.log(
      `${name}: modal Shell and Extrude checkpoints, baseline, redo, branching and grouped acceptance passed`,
    );
  },
  { timeout: 30000 },
);
