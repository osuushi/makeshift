import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { cleanBodySeparately, standaloneOnly, undoToDocument } from "./ui-cleanup-controls.mjs";
import { at, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function axialCleanupRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  const points = [
    [-10, -10],
    [0, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
    [-10, -10],
  ];
  for (let i = 1; i < points.length; i++) await drag(page, points[i - 1], points[i]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const beforeExtrusion = (await inspect(page)).document;
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  assert.equal(await distance.inputValue(), "0");
  assert.ok(await page.getByRole("button", { name: "Accept extrusion", exact: true }).isDisabled());
  await standaloneOnly(page);
  await tabTo(page, "Extrusion distance");
  await tabTo(page, "Extrusion twist");
  await tabTo(page, "Draft value");
  await tabTo(page, "Extrusion twist", "Shift+Tab");
  await tabTo(page, "Extrusion distance", "Shift+Tab");
  await distance.fill("10");
  const preview = (await inspect(page)).preview;
  await standaloneOnly(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await modalCompleted(page);
  const original = (await inspect(page)).document;
  assert.deepEqual(original, preview, "Ordinary extrusion preserves split walls");
  await cleanBodySeparately(page, original);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  // Whole-body cleanup retains selection and its gizmo can cover the cap.
  assert.deepEqual((await inspect(page)).modelingSelection, [
    { kind: "body", body: original.bodies[0].id },
  ]);
  await clearSelection(page);
  const cap = await project(page, [6, 6, 10]);
  await page.mouse.click(cap.x, cap.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  const offset = await relativeOffsetInput(page);
  assert.equal(await offset.inputValue(), "0");
  assert.ok(
    await page.getByRole("button", { name: "Accept face offset", exact: true }).isDisabled(),
  );
  await tabTo(page, await offset.getAttribute("aria-label"));
  await offset.fill("1");
  const changed = (await inspect(page)).preview;
  await standaloneOnly(page);
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  await modalCompleted(page);
  const accepted = (await inspect(page)).document;
  assert.deepEqual(accepted, changed, "Ordinary offset preserves its candidate topology");
  await cleanBodySeparately(page, accepted);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await undoToDocument(page, original);
  assert.deepEqual((await inspect(page)).document, original);
  await undoToDocument(page, beforeExtrusion);
  assert.deepEqual((await inspect(page)).document, beforeExtrusion);
}

/** Full tool controls now share traversal; numeric fields remain reachable in either direction. */
async function tabTo(page, label, key = "Tab") {
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.keyboard.press(key);
    if (
      await page.evaluate(
        (label) => document.activeElement?.getAttribute("aria-label") === label,
        label,
      )
    )
      return;
  }
  assert.fail(`${label} was unreachable using ${key}`);
}
