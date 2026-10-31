import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Founder capture: the mesh-only circular cut hid its accepted operand, and
// GPU caps ignored the replacement. Model tests cannot observe missing paint.
export async function sectionExtrusion(page, sample) {
  await openDocument(page, resolve("tests/fixtures/section-extrusion.makeshift"));
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await orient(page, [0, 0, 1]);
  await chooseTool(page, "cross section", "cross-section");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await orient(page, [1, 0.7, 1.4]);
  const original = (await inspect(page)).document;
  // Opposite the extrusion handle so moving UI never covers the GPU sample.
  const material = [-10, -2, 0];
  await page.mouse.move(1100, 80);
  const unselected = await sample(page, material);
  const p = await project(page, [3, 2, 0]);
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  await page.keyboard.press("e");
  const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
  await handle.click();
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  await distance.fill("-2");
  await page.waitForFunction(() => !!window.makeshiftInspect().preview);
  await page.mouse.move(1100, 80);
  // Keep selection/X-ray overlays identical when comparing full and mesh-only previews.
  const before = await sample(page, material);
  assert.deepEqual((await inspect(page)).document, original, "Preview leaves accepted data intact");
  const box = await handle.boundingBox();
  assert.ok(box);
  const a = await project(page, [0, 0, 0]);
  const b = await project(page, [0, 0, -4]);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.keyboard.down("Shift");
  try {
    await page.mouse.move(x + b.x - a.x, y + b.y - a.y);
    await page.waitForFunction(() => !!window.makeshiftInspect().visualPreview?.bodies.length);
    samePattern(await sample(page, material), before, "Mesh-only drag retains the section fill");
    const previous = JSON.stringify((await inspect(page)).visualPreview);
    await page.mouse.move(x + 2 * (b.x - a.x), y + 2 * (b.y - a.y));
    await page.waitForFunction((previous) => {
      const visual = window.makeshiftInspect().visualPreview;
      return visual && JSON.stringify(visual) !== previous;
    }, previous);
    samePattern(await sample(page, material), before, "Drag updates retain the same pattern");
  } finally {
    await page.mouse.up();
    await page.keyboard.up("Shift");
  }
  await page.waitForFunction(() => !!window.makeshiftInspect().preview);
  await page.mouse.move(1100, 80);
  assert.deepEqual(await sample(page, material), before, "Release retains the section fill");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original, "Cancel restores the captured solid");
  await chooseTool(page, "clear selection", "selection-clear");
  await page.mouse.move(1100, 80);
  assert.deepEqual(await sample(page, material), unselected, "Cancel restores the section fill");
}

function samePattern(actual, expected, message) {
  // Batched Float32 bounds can move antialiased pattern edges by one RGB level.
  const delta = Math.max(...actual.map((value, i) => Math.abs(value - expected[i])));
  assert.ok(delta <= 2, `${message}: maximum RGB difference ${delta}`);
}
