import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/erosion-towers.json", "utf8"));
const thickness = (page) => page.getByRole("textbox", { name: /^Erode by$/ });
const allowance = (page) =>
  page.getByRole("textbox", { name: "Extra thickness allowance", exact: true });

async function enter(page) {
  // Do not wait for the calculation: this route must exercise cancellation while it runs.
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("combobox", { name: "Find a tool" }).fill("erode");
  await page.locator('[data-command="erode"]').click();
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return state.interaction?.kind === "erode" && state.busy;
  });
  assert.equal(await thickness(page).inputValue(), "1");
  assert.equal(
    await page.getByRole("combobox", { name: "Mesh detail", exact: true }).inputValue(),
    "standard",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "CAD face budget", exact: true }).inputValue(),
    "128",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Keep originals", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
}

async function cancellation(page, original) {
  for (const method of ["calculation", "escape", "panel"]) {
    await enter(page);
    await thickness(page).fill("4");
    const progress = page.locator(".calculation-progress").filter({
      has: page.getByRole("button", { name: "Cancel calculation", exact: true }),
    });
    await progress.waitFor({ state: "visible" });
    assert.match(await progress.textContent(), /Calculating erosion/);
    const started = performance.now();
    if (method === "escape") await page.keyboard.press("Escape");
    else
      await page
        .getByRole("button", {
          name: method === "calculation" ? "Cancel calculation" : "Cancel erosion",
          exact: true,
        })
        .click();
    const state = await inspect(page);
    assert.ok(performance.now() - started < 2000, `${method}: cancellation is prompt`);
    assert.equal(state.interaction, null);
    assert.equal(state.preview, null);
    assert.deepEqual(state.document, original);
    assert.equal(await page.locator(".erosion-widget").isVisible(), false);
    assert.equal(
      (await page.evaluate(() => window.makeshiftHistory())).at(-1).outcome,
      "cancelled",
    );
  }
}

async function suggestedAllowance(page, name, original) {
  await enter(page);
  await page
    .getByRole("combobox", { name: "Erosion method", exact: true })
    .selectOption("accurate");
  await thickness(page).fill("4");
  assert.equal(await allowance(page).inputValue(), "50", "Thickness edits retain the percentage");
  await allowance(page).fill("2.5"); // 0.1 mm extra at 4 mm minimum.
  const started = performance.now();
  let state = await inspect(page);
  assert.ok(performance.now() - started < 15000, "Failure does not repeat slow coverage attempts");
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, original);
  const suggest = page.getByRole("button", { name: "Try suggested allowance", exact: true });
  assert.ok(await suggest.isVisible());
  assert.match(await page.locator(".erosion-status").textContent(), /allowance/i);
  assert.equal(await page.locator(".local-feedback").isVisible(), false);
  const value = Number((await suggest.textContent()).match(/Try ([\d.]+)%/)[1]);
  assert.ok(value > 2.5 && value <= 30, "Suggestion is useful at this model scale");
  assert.equal(value % 10, 0, "Suggested allowance rounds upward to a multiple of 10%");
  await page.mouse.move(1100, 750);
  const fits = await suggest.evaluate((button) => button.scrollWidth <= button.clientWidth);
  assert.ok(fits, "Allowance suggestion fits its button");
  await page.screenshot({ path: `.cache/sketch-review/${name}-erosion-allowance-suggestion.png` });
  await suggest.click();
  state = await inspect(page);
  assert.equal(await thickness(page).inputValue(), "4");
  assert.equal(Number(await allowance(page).inputValue()), value);
  assert.equal(state.preview?.bodies.length, 2);
  assert.deepEqual(state.document, original);
  assert.equal(await suggest.isVisible(), false);
  await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 2);
  const operation = (await page.evaluate(() => window.makeshiftHistory())).at(-1).operation;
  assert.ok(Math.abs(operation.parameters.operation.allowance - (4 * value) / 100) < 1e-10);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-erosion-suggested`);
  await page
    .getByRole("button", { name: /^Select Body / })
    .first()
    .click();
  await enter(page);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).interaction, null);
}

await withUiRuntimes(
  async (page, name) => {
    await openDocument(page, {
      name: "erosion-towers.makeshift",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
      ),
    });
    const original = (await inspect(page)).document;
    await page
      .getByRole("button", { name: /^Select Body / })
      .first()
      .click();
    try {
      await cancellation(page, original);
      await suggestedAllowance(page, name, original);
    } catch (error) {
      console.error(`${name}: responsiveness route failed`, error);
      await page.keyboard.press("Escape");
      await inspect(page);
      throw error;
    }
    console.log(
      `${name}: automatic entry, fresh values, three cancellation routes, bounded failure, suggestion, acceptance/history/archive passed`,
    );
  },
  { timeout: 30000 },
);
