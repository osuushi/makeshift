import assert from "node:assert/strict";
import { openDocument } from "./native-documents.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { assertPreview, pointerTo } from "./ui-guide-tool-helpers.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";

export async function startToolDrag(page, name) {
  const handle = page.getByRole("button", { name, exact: true });
  const box = await handle.boundingBox();
  assert.ok(box);
  for (const y of [0.5, 0.25, 0.75])
    for (const x of [0.5, 0.25, 0.75]) {
      const point = { x: box.x + box.width * x, y: box.y + box.height * y };
      await page.mouse.move(point.x, point.y);
      if (
        await handle.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), point)
      ) {
        await page.mouse.down();
        return;
      }
    }
  assert.fail(`No exposed pointer target on ${name}`);
}
export async function waitSurfaceLock(page, point) {
  await page.waitForFunction(
    (point) =>
      [...document.querySelectorAll(".guide-destination-lock")].some(
        (e) => Math.hypot(...JSON.parse(e.dataset.point).map((v, i) => v - point[i])) < 1e-7,
      ),
    point,
  );
}

// Direct tool handles fit a surface through an off-axis reference. Pure parameter
// tests cannot catch target visibility, captured pointer hits or premature acceptance.
export async function surfaceToolRoute(page, path, body) {
  await openDocument(page, path);
  const before = (await inspect(page)).document;
  for (const tool of ["offset", "extrude"]) {
    await worldClick(page, [7, 8, 10]);
    if (tool === "extrude") await page.keyboard.press("e");
    await startToolDrag(page, tool === "extrude" ? "Drag extrusion" : "Offset faces");
    await pointerTo(page, [45, 0, 18]);
    await waitSurfaceLock(page, [45, 0, 18]);
    await assertPreview(page, before, body, 7200);
    assert.equal(await page.locator(".guide-face-plane-patch").count(), 1);
    await page.keyboard.down("Shift");
    await page.waitForFunction(() => !document.querySelector(".guide-destination-lock"));
    await page.keyboard.up("Shift");
    await waitSurfaceLock(page, [45, 0, 18]);
    await pointerTo(page, [45, 0, 18]);
    await waitSurfaceLock(page, [45, 0, 18]);
    await page.keyboard.press("g");
    await page.waitForFunction(() => !document.querySelector(".guide-destination-lock"));
    await page.keyboard.press("g");
    await waitSurfaceLock(page, [45, 0, 18]);
    await page.screenshot({ path: `.cache/sketch-review/surface-${tool}-snap.png` });
    await page.mouse.up();
    await assertPreview(page, before, body, 7200);
    await page.keyboard.press("Escape");
    await modalCompleted(page);
    assert.deepEqual((await inspect(page)).document, before);
  }
  await page.keyboard.press("g");
  await worldClick(page, [7, 8, 10]);
  await startToolDrag(page, "Offset faces");
  await pointerTo(page, [45, 0, 18]);
  assert.equal(await page.locator(".guide-move-destinations circle").count(), 0);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  await page.keyboard.press("g");
  console.log("Ordinary Offset/Extrude handles snap their surfaces to off-axis guide points");
}

export async function surfaceCylinderRoute(page, fixture) {
  await openDocument(page, fixture.path);
  const before = (await inspect(page)).document;
  for (const tool of ["offset", "extrude"]) {
    await worldClick(page, [3, -4, 5]);
    if (tool === "extrude") await page.keyboard.press("e");
    await startToolDrag(page, tool === "extrude" ? "Drag extrusion" : "Offset faces");
    await pointerTo(page, [0, 8, 0]);
    await waitSurfaceLock(page, [0, 8, 0]);
    assert.ok(await page.locator(".guide-cylinder-patch").count());
    await page.screenshot({ path: `.cache/sketch-review/surface-cylinder-${tool}-snap.png` });
    await page.mouse.up();
    await assertPreview(page, before, fixture.body, Math.PI * 64 * 10);
    await page.keyboard.press("Escape");
    await modalCompleted(page);
  }
  console.log("Ordinary cylindrical handles snap radius through an off-axis point");
}
