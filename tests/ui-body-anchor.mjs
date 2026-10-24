import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function center(locator) {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
export async function bodyAnchorRoute(page, name) {
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  const before = await inspect(page);
  const anchor = page.getByRole("button", { name: "Reposition body pivot", exact: true });
  const original = await center(anchor);
  await assertHandleSpacing(page);
  const canvas = await page.locator("canvas").boundingBox();
  const scale = canvas.height / before.camera.height;
  assert.equal(
    await page
      .locator(".body-translate-handle")
      .allTextContents()
      .then((x) => x.join("")),
    "",
  );
  assert.equal(
    await anchor.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return (
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") ===
        element
      );
    }),
    true,
    "The center owns its hit area",
  );
  await page.mouse.move(original.x, original.y);
  await page.mouse.down();
  await page.mouse.move(original.x - 4 * scale, original.y + 3 * scale, { steps: 6 });
  await page.mouse.up();
  const moved = await center(anchor);
  assert.ok(Math.abs(moved.x - original.x + 4 * scale) < 1);
  assert.ok(Math.abs(moved.y - original.y - 3 * scale) < 1);
  assert.deepEqual((await inspect(page)).document, before.document);
  // Escape cancels only the unfinished anchor gesture.
  await page.mouse.move(moved.x, moved.y);
  await page.mouse.down();
  await page.mouse.move(moved.x + 50, moved.y + 40, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(await center(anchor), moved);
  await page.getByRole("button", { name: "Rotate layer", exact: true }).click();
  await page.getByRole("button", { name: "Rotate body Z", exact: true }).click();
  await page.locator(".body-transform-value").fill("90");
  await page.keyboard.press("Enter");
  const rotated = (await inspect(page)).document.bodies[0];
  const body = before.document.bodies[0];
  const pivotX = before.camera.target[0] + (moved.x - canvas.x - canvas.width / 2) / scale;
  const pivotY = before.camera.target[1] - (moved.y - canvas.y - canvas.height / 2) / scale;
  assert.ok(Math.abs(rotated.center[0] - (pivotX - (body.center[1] - pivotY))) < 1e-3);
  assert.ok(Math.abs(rotated.center[1] - (pivotY + body.center[0] - pivotX)) < 1e-3);
  // One Undo restores the rotation: moving the anchor added no history entry.
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before.document);
  await orient(page, [0.5, 0.5, 1]);
  await assertHandleSpacing(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-anchor.png` });
  await page.keyboard.press("Escape");
  console.log(
    `${name}: direct anchor drag, hit priority, cancellation and pivoted rotation passed`,
  );
}

async function assertHandleSpacing(page) {
  const boxes = await page.locator(".body-gizmo button:visible").evaluateAll((elements) =>
    elements.map((e) => {
      const r = e.getBoundingClientRect();
      return { label: e.getAttribute("aria-label"), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.ok(
        Math.hypot(boxes[i].x - boxes[j].x, boxes[i].y - boxes[j].y) > 40,
        `${boxes[i].label} and ${boxes[j].label} need distinct hit areas`,
      );
}
