import assert from "node:assert/strict";
import { installPenClassification } from "./ipad-pen.mjs";
import { at, drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function driftTap(page, handle, label, travel = 8) {
  const box = await handle.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + travel, y);
  await page.mouse.up();
  await page.waitForFunction(
    (label) => document.activeElement?.getAttribute("aria-label") === label,
    label,
    { timeout: 12000 },
  );
  const field = page.getByRole("textbox", { name: label, exact: true });
  assert.equal(
    await field.evaluate(
      (input) => input.selectionStart === 0 && input.selectionEnd === input.value.length,
    ),
    true,
  );
  await page.mouse.move(x + travel + 0.1, y);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(
    await field.evaluate((input) => document.activeElement === input),
    true,
    "Hover after lifting retains numeric focus",
  );
  return field;
}

await withUiRuntimes(
  async (page, name) => {
    await installPenClassification(page);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.makeshiftInspect));
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
    await page.keyboard.press("r");
    await drag(page, [-15, -10], [15, 10]);
    const original = (await inspect(page)).document;
    await page.evaluate(() => {
      window.testPen = true;
    });
    await page.keyboard.press("m");
    for (const travel of [1, 8, 15]) {
      await driftTap(page, page.locator('[data-move-marker="x"]'), "Move X", travel);
      assert.deepEqual((await inspect(page)).document, original);
      await page.keyboard.press("Escape");
      await page.keyboard.press("m");
    }
    const pick = await at(page, 3, 2);
    await chooseTool(page, "return to modeling", "modeling");
    await page.mouse.click(pick.x, pick.y);
    await page.keyboard.press("m");
    await driftTap(
      page,
      page.getByRole("button", { name: "Move sketch X", exact: true }),
      "Translation X",
    );
    assert.deepEqual((await inspect(page)).document, original);
    await page.keyboard.press("Escape");
    await page.mouse.click(pick.x, pick.y);
    const extrusion = await driftTap(
      page,
      page.getByRole("button", { name: "Drag extrusion", exact: true }),
      "Extrusion distance",
    );
    await extrusion.fill("5");
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Enter");
    const body = (await inspect(page)).document;
    await page.mouse.click(pick.x, pick.y);
    await chooseTool(page, "select owning bodies", "selection-bodies");
    await page.keyboard.press("m");
    const move = await driftTap(
      page,
      page.getByRole("button", { name: "Move body X", exact: true }),
      "Body translation X",
    );
    assert.deepEqual(
      (await inspect(page)).document,
      body,
      "Pencil tap drift must not accept movement",
    );
    await move.fill("3");
    await page.keyboard.press("Enter");
    assert.notDeepEqual((await inspect(page)).document, body);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, body);
    await deliberateDrags(page, body);
    console.log(
      `${name}: Pencil tap drift retains sketch/extrusion/body numeric entry; typed body movement and Undo passed`,
    );
  },
  { allowed: ["webkit"], hasTouch: true, timeout: 12000 },
);

async function deliberateDrags(page, body) {
  const handle = page.getByRole("button", { name: "Move body X", exact: true });
  for (const [pen, travel] of [
    [true, 40],
    [false, 4],
  ]) {
    await page.evaluate((pen) => {
      window.testPen = pen;
    }, pen);
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + travel, y);
    await page.mouse.up();
    assert.notDeepEqual(
      (await inspect(page)).document,
      body,
      "Deliberate drag still moves geometry",
    );
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, body);
  }
}
