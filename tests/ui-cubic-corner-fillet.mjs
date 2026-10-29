import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arcAt } from "../.cache/sketch-tests/src/sketch/arc-geometry.js";
import { filletCorner, filletShape } from "../.cache/sketch-tests/src/sketch/fillet-geometry.js";
import { openDocument } from "./native-documents.mjs";
import { filletGuidePoint } from "./ui-fillet-guide-helpers.mjs";
import { at, click, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Focused manual regression: selected cubic endpoints must expose a usable SVG guide.
export async function cubicCornerFilletRoute(page, name) {
  const fixture = JSON.parse(readFileSync("tests/fixtures/cubic-corner-fillet.json", "utf8"));
  await reset(page);
  await openDocument(page, {
    name: "cubic-corner.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.keyboard.press("v");
  const before = (await inspect(page)).document;
  await click(page, 0.5, 10);
  const from = await filletGuidePoint(page);
  const [, cubic, line] = before.sketches[0].curves;
  const target = arcAt(filletShape(filletCorner(cubic, line, "b", "a"), 2, "target"), 0.5);
  const to = await at(page, target.x, target.y);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.sketches[0].curves.length, 4, await page.getByRole("status").textContent());
  assert.equal(accepted.sketches[0].constraints.filter((c) => c.kind === "tangent").length, 2);
  await click(page, 20, 20);
  const point = arcAt(accepted.sketches[0].curves.at(-1), 0.5);
  await click(page, point.x, point.y);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  assert.notDeepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await click(page, 0.5, 10);
  const guide = await filletGuidePoint(page);
  await page.mouse.click(guide.x, guide.y);
  assert.ok((await inspect(page)).document.sketches[0].curves.some((c) => c.kind === "arc"));
  console.log(
    `${name}: captured cubic corner guide drag/click, reselection, radius edit and Undo passed`,
  );
}
