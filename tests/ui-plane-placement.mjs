import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function planePlacementRoute(page) {
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).first().click();
  await chooseTool(page, "transform", "transform");
  const box = await page.getByRole("button", { name: "Move plane X", exact: true }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  let s = await inspect(page);
  assert.notDeepEqual(
    s.document.constructionPlanes[0].frame.origin,
    original.constructionPlanes[0].frame.origin,
  );
  assert.equal(s.preview, null, "Translation drag commits on release like body Move");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).first().click();
  await page.getByRole("button", { name: "Move plane X", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation X", exact: true }).fill("bad");
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("textbox", { name: "Plane translation X", exact: true }).fill("3");
  assert.equal(
    await page
      .getByRole("textbox", { name: "Plane translation X", exact: true })
      .getAttribute("aria-invalid"),
    "false",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).first().click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Rotate plane X", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane rotation X", exact: true }).fill("30");
  await page.keyboard.press("Enter");
  await settled(page);
  s = await inspect(page);
  assert.ok(Math.abs(s.document.constructionPlanes[0].frame.v[2] - 0.5) < 1e-7);
  assert.deepEqual(s.document.sketches, original.sketches);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}
