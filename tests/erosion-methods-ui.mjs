import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await plate(page);
    await chooseTool(page, "select owning bodies", "selection-bodies");
    const original = (await inspect(page)).document;
    await chooseTool(page, "erode", "erode");
    const method = page.getByRole("combobox", { name: "Erosion method", exact: true });
    const detail = page.getByRole("combobox", { name: "Mesh detail", exact: true });
    const budget = page.getByRole("textbox", { name: "CAD face budget", exact: true });
    const allowance = page.getByRole("textbox", { name: "Extra thickness allowance", exact: true });
    assert.deepEqual(await method.locator("option").allTextContents(), [
      "Remesh (usually faster, more flexible)",
      "Analytic (more accurate, often slower)",
    ]);
    assert.deepEqual(await detail.locator("option").allTextContents(), [
      "Coarse",
      "Standard",
      "Fine",
    ]);
    assert.equal(await method.inputValue(), "fast");
    assert(await page.getByRole("textbox", { name: "Erode by", exact: true }).isVisible());
    assert.equal(await allowance.count(), 0);
    const fast = (await inspect(page)).preview.bodies.at(-1);
    close(fast.volume, 2592);
    assert.match(await page.locator(".erosion-quality").textContent(), /Sampled thickness 1–1 mm/);
    await detail.selectOption("fine");
    await inspect(page);
    await budget.fill("32");
    await inspect(page);
    await page.locator(".erosion-status").click();
    await page.keyboard.press("Meta+z");
    await inspect(page);
    assert.equal(await budget.inputValue(), "128");
    assert.equal(await detail.inputValue(), "fine");
    await page.keyboard.press("Meta+Shift+z");
    await inspect(page);
    assert.equal(await budget.inputValue(), "32");
    await budget.fill("1");
    const state = await inspect(page);
    assert.equal(state.preview, null);
    assert(await page.getByRole("button", { name: "Accept erosion", exact: true }).isDisabled());
    await method.selectOption("accurate");
    close((await inspect(page)).preview.bodies.at(-1).volume, 2592);
    assert(await page.getByRole("textbox", { name: "Erode by", exact: true }).isVisible());
    assert.equal(await detail.count(), 0);
    await allowance.fill("0");
    close((await inspect(page)).preview.bodies.at(-1).volume, 2592);
    await method.selectOption("fast");
    await inspect(page);
    await budget.fill("128");
    await inspect(page);
    await page.locator(".erosion-status").click();
    await page.keyboard.press("Meta+z");
    await inspect(page);
    assert.equal(await budget.inputValue(), "1");
    await page.keyboard.press("Meta+z");
    await inspect(page);
    assert.equal(await method.inputValue(), "accurate");
    await page.keyboard.press("Meta+Shift+z");
    await inspect(page);
    assert.equal(await method.inputValue(), "fast");
    await page.keyboard.press("Meta+Shift+z");
    await inspect(page);
    assert.equal(await budget.inputValue(), "128");
    await page.screenshot({ path: `.cache/sketch-review/${name}-erosion-controls.png` });
    await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
    const accepted = (await inspect(page)).document;
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
    await bodyArchiveRoute(page, `${name}-erosion-methods`);
    await cancelRestart(page, method, detail, budget);
    console.log(
      `${name}: Remesh controls/report, parameter history, Analytic isolation, archive and cancellation passed`,
    );
  },
  { timeout: 30000 },
);

async function cancelRestart(page, method, detail, budget) {
  const reopened = (await inspect(page)).document;
  await page
    .getByRole("button", { name: /^Select Body / })
    .first()
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("combobox", { name: "Find a tool" }).fill("erode");
  await page.locator('[data-command="erode"]').click();
  assert.equal(await method.inputValue(), "fast");
  assert.equal(await detail.inputValue(), "standard");
  assert.equal(await budget.inputValue(), "128");
  await method.selectOption("accurate");
  await method.selectOption("fast");
  await page.keyboard.press("Escape");
  const state = await inspect(page);
  assert.equal(state.interaction, null);
  assert.deepEqual(state.document, reopened);
}
