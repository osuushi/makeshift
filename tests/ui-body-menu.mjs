import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";

export async function openBodyMenu(page, name = "Body 1") {
  await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
  return page.getByRole("menu", { name: `Actions for ${name}`, exact: true });
}

/** Menus must target their row, escape panel clipping, and preserve selection on dismissal. */
export async function bodyMenuRoute(page, name) {
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  const before = await inspect(page);
  const trigger = page.getByRole("button", { name: "Actions for Body 2", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Actions for Body 2", exact: true });
  assert.equal(
    await menu
      .getByRole("menuitem", { name: "Color", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  assert.deepEqual(
    await menu
      .locator(":scope > *")
      .evaluateAll((items) =>
        items.map((el) => (el.tagName === "HR" ? "separator" : el.textContent)),
      ),
    ["Color", "X-ray", "separator", "Isolate"],
  );
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await menu
      .getByRole("menuitemcheckbox", { name: "X-ray", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await menu.isVisible(), false);
  assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
  assert.deepEqual((await inspect(page)).modelingSelection, before.modelingSelection);
  await trigger.click();
  await page.getByRole("heading", { name: "Entities", exact: true }).click();
  assert.equal(await menu.isVisible(), false, "Outside click dismisses the menu");
  await trigger.click();
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-menu.png` });
  await menu.getByRole("menuitem", { name: "Isolate", exact: true }).click();
  assert.ok(await page.getByRole("button", { name: "Hide Body 2", exact: true }).isVisible());
  for (const n of [1, 3])
    assert.ok(await page.getByRole("button", { name: `Show Body ${n}`, exact: true }).isVisible());
  assert.deepEqual(
    (await inspect(page)).modelingSelection,
    before.modelingSelection,
    "Isolate uses the row body, not the selected body",
  );
  assert.deepEqual((await inspect(page)).document, before.document);
  await page.getByRole("button", { name: "Exit isolation", exact: true }).click();
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 700, height: 500 });
  await openBodyMenu(page, "Body 3");
  const small = page.getByRole("menu", { name: "Actions for Body 3", exact: true });
  const box = await small.boundingBox();
  assert.ok(
    box.x >= 0 && box.y >= 0 && box.x + box.width <= 700 && box.y + box.height <= 500,
    "Menu stays inside a constrained viewport",
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-menu-small.png` });
  assert.ok(await small.isVisible(), "Scrolling the trigger into view must not dismiss its menu");
  await page.keyboard.press("Escape");
  await page.setViewportSize(viewport);
  console.log(
    `${name}: body menu order, keyboard, dismissal, row-specific isolation and constrained layout passed`,
  );
}
