import assert from "node:assert/strict";
import { click, inspect } from "./ui-helpers.mjs";

async function dragControl(page, control, dx, dy) {
  const box = await control.boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

// Real selected curves keep measurement/constraint visibility and rerenders in play.
// Unit layout tests cannot catch panel interception of canvas gestures or lost controls.
export async function inspectorRoute(page, name) {
  const pane = page.locator('[data-pane="Measurements"]');
  const title = pane.locator(".pane-title");
  await click(page, 8, 4);
  await page.locator(".measurement-readout > div").first().waitFor();
  const original = (await inspect(page)).document;
  await dragControl(page, title, -330, 20);
  assert.ok(await pane.evaluate((el) => el.classList.contains("floating")));
  const before = await pane.boundingBox();
  await dragControl(page, pane.locator(".pane-grip"), 35, 30);
  const resized = await pane.boundingBox();
  assert.ok(resized.width >= before.width + 34 && resized.height >= before.height + 29);
  await title.focus();
  await page.keyboard.press("Space");
  assert.equal(await title.getAttribute("aria-expanded"), "false");
  await pane.getByRole("combobox").selectOption("left");
  assert.deepEqual((await inspect(page)).document, original);
  await page.reload();
  await page.locator('[data-side="left"] [data-pane="Measurements"]').waitFor();
  assert.equal(await title.getAttribute("aria-expanded"), "false");
  await title.click();
  await pane.getByRole("combobox").selectOption("right");
  await page.setViewportSize({ width: 600, height: 400 });
  await page.waitForSelector('.pane-column.closed[data-side="right"]');
  await page.locator('[data-side="right"] .pane-rail').click();
  assert.ok(await pane.isVisible());
  await page.setViewportSize({ width: 1280, height: 850 });
  console.log(`${name} pane drag, resize, fold, docking, persistence and narrow screen passed`);
}

export async function inspectorRepairsRoute(page, name, document) {
  const { openDocument } = await import("./native-documents.mjs");
  const { chooseTool } = await import("./ui-tools.mjs");
  await openDocument(page, {
    name: "inspector-repairs.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "makeshift",
        version: 1,
        document: {
          ...document,
          decorators: document.decorators.map((decorator) => ({
            ...decorator,
            problem:
              "Decorator continuation needs attention: Gear requires analytic cylindrical, conic or planar pitch faces",
          })),
        },
      }),
    ),
  });
  await inspect(page);
  const repairs = page.locator(".decorator-repair");
  await repairs.first().waitFor();
  assert.equal(await repairs.count(), 2);
  assert.equal(await page.locator(".decorator-repair[open]").count(), 0);
  await page.screenshot({ path: `.cache/sketch-review/${name}-inspector-repairs.png` });
  await page
    .locator('[data-pane="Decorators"]')
    .screenshot({ path: `.cache/sketch-review/${name}-inspector-styled-detail.png` });
  await repairs.first().locator("summary").focus();
  await page.keyboard.press("Enter");
  await repairs
    .first()
    .getByRole("button", { name: "Select affected geometry", exact: true })
    .click();
  await page.screenshot({ path: `.cache/sketch-review/${name}-inspector-repair-expanded.png` });
  const selected = await inspect(page);
  assert.equal(selected.modelingSelection.length, 1);
  assert.equal(selected.modelingSelection[0].kind, "face");
  assert.equal(await repairs.first().getAttribute("open"), "");
  await repairs.first().locator("summary").click();
  await repairs.last().locator("summary").click();
  await repairs
    .last()
    .getByRole("button", { name: "Remove unresolved decorator", exact: true })
    .click();
  assert.equal((await inspect(page)).document.decorators.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.decorators.length, 2);
  console.log(
    `${name}: collapsed decorator notices, disclosure across selection, discard and Undo passed`,
  );
}
