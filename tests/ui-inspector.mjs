import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";

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
  const pane = page.getByRole("complementary", { name: "Inspector", exact: true });
  await page.locator(".measurement-readout > div").first().waitFor();
  const original = (await inspect(page)).document;
  const anchored = await pane.boundingBox();
  await dragControl(page, page.locator('.inspector-edge[data-edge="nw"]'), -60, -50);
  const grown = await pane.boundingBox();
  assert.ok(Math.abs(grown.width - anchored.width - 60) < 2);
  assert.ok(Math.abs(grown.height - anchored.height - 50) < 2);
  assert.ok(Math.abs(grown.x + grown.width - anchored.x - anchored.width) < 2);
  assert.ok(Math.abs(grown.y + grown.height - anchored.y - anchored.height) < 2);
  await page.getByRole("button", { name: "Reset Inspector layout", exact: true }).click();
  await page.waitForFunction(
    (width) =>
      Math.abs(document.querySelector(".inspector").getBoundingClientRect().width - width) < 2,
    anchored.width,
  );
  const before = await pane.boundingBox();
  await dragControl(
    page,
    page.getByRole("button", { name: "Move Inspector", exact: true }),
    -160,
    -140,
  );
  const moved = await pane.boundingBox();
  assert.ok(Math.abs(moved.x - before.x + 160) < 2);
  assert.ok(Math.abs(moved.y - before.y + 140) < 2);
  await dragControl(page, page.locator('.inspector-edge[data-edge="se"]'), 80, 60);
  const resized = await pane.boundingBox();
  assert.ok(resized.width > moved.width + 70);
  assert.ok(resized.height > moved.height + 50);
  await page.getByRole("button", { name: "Measurements", exact: true }).focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator(".measurement-readout").isVisible(), false);
  await page.getByRole("button", { name: "Move Measurements up", exact: true }).click();
  assert.equal(
    await page.locator(".inspector-section").first().getAttribute("data-section"),
    "Measurements",
  );
  await page.getByRole("button", { name: "Collapse Inspector", exact: true }).click();
  assert.ok((await pane.boundingBox()).height < 50);
  assert.deepEqual((await inspect(page)).document, original);
  await page.reload();
  await page.getByRole("button", { name: "Expand Inspector", exact: true }).waitFor();
  await page.getByRole("button", { name: "Expand Inspector", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Measurements", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(
    await page.locator(".inspector-section").first().getAttribute("data-section"),
    "Measurements",
  );
  await page.waitForFunction(
    (width) =>
      Math.abs(document.querySelector(".inspector").getBoundingClientRect().width - width) < 2,
    resized.width,
  );
  const restored = await pane.boundingBox();
  assert.ok(Math.abs(restored.width - resized.width) < 2);
  assert.ok(Math.abs(restored.x - resized.x) < 2);
  await page.getByRole("button", { name: "Measurements", exact: true }).click();
  await page.locator(".measurement-readout > div").first().waitFor();
  await page.screenshot({ path: `.cache/sketch-review/${name}-inspector.png` });
  await page.setViewportSize({ width: 600, height: 400 });
  await page.waitForFunction(() => {
    const r = document.querySelector(".inspector").getBoundingClientRect();
    const footer = document.querySelector("footer").getBoundingClientRect();
    return r.right <= innerWidth && r.bottom <= footer.top && r.top >= 0;
  });
  await page.screenshot({ path: `.cache/sketch-review/${name}-inspector-narrow.png` });
  await page.getByRole("button", { name: "Reset Inspector layout", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 850 });
  console.log(
    `${name}: Inspector move, resize, collapse, reorder, persistence and viewport fitting passed`,
  );
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
    .locator(".inspector")
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
