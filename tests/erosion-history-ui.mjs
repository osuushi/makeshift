import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { accurateErosion } from "./ui-erosion-method.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(async (page, name) => {
  await plate(page);
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await accurateErosion(page);
  const original = (await inspect(page)).document;
  const thickness = page.getByRole("textbox", { name: "Erode by", exact: true });
  const allowance = page.getByRole("textbox", { name: "Extra thickness allowance", exact: true });
  const keep = page.getByRole("button", { name: "Keep originals", exact: true });
  async function values(t, a, k, volume) {
    const state = await inspect(page);
    assert.equal(state.interaction?.kind, "erode");
    assert.deepEqual(state.document, original);
    assert.equal(Number(await thickness.inputValue()), t);
    assert.equal(Number(await allowance.inputValue()), a);
    assert.equal(await keep.getAttribute("aria-pressed"), String(k));
    assert.equal(state.preview.bodies.length, k ? 2 : 1);
    close(state.preview.bodies.at(-1).volume, volume);
  }
  async function history(redo = false) {
    await page.keyboard.press(redo ? "Meta+Shift+z" : "Meta+z");
    await inspect(page);
  }
  await thickness.fill("2");
  await inspect(page);
  await page.locator(".erosion-status").click();
  await allowance.fill("80");
  await inspect(page);
  await page.locator(".erosion-status").click();
  await keep.click();
  await values(2, 80, false, 1536);
  await history();
  await values(2, 80, true, 1536);
  await history();
  await values(2, 50, true, 1536);
  await history();
  await values(1, 50, true, 2592);
  await history();
  assert.equal(await page.getByRole("combobox", { name: "Erosion method" }).inputValue(), "fast");
  const fast = await inspect(page);
  close(fast.preview.bodies[1].volume, 2592);
  await history(true);
  await values(1, 50, true, 2592);
  await history(true);
  await values(2, 50, true, 1536);
  await allowance.fill("60");
  await inspect(page);
  await page.locator(".erosion-status").click();
  await history(true);
  await values(2, 60, true, 1536);
  await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
  const accepted = (await inspect(page)).document;
  await history();
  assert.deepEqual((await inspect(page)).document, original);
  await history(true);
  assert.deepEqual((await inspect(page)).document, accepted);
  console.log(`${name}: Erode local parameter Undo/Redo, branching and grouped acceptance passed`);
});
