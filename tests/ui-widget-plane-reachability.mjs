import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { deliveredAxisDelta } from "./ui-widget-delivered-input.mjs";
import { dragPixels, sweepWidgets } from "./ui-widget-reachability.mjs";
import { assertRotatedFrame, assertTranslatedFrame, rotateDocked } from "./ui-widget-rotation.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const gizmo =
  ".body-gizmo:not([hidden]) > button:not([hidden]), .body-gizmo:not([hidden]) > input:not([hidden])";

export async function planeReachability(page, name) {
  await reset(page);
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  const before = (await inspect(page)).document;
  await chooseTool(page, "construction plane", "construction-plane");
  await pickPlane(page, "XY");
  await orient(page, [1, -1, 0.8]);
  await sweepWidgets(page, [0, 0, 0], gizmo, "construction plane");
  const rotationBefore = (await inspect(page)).preview.constructionPlanes[0].frame;
  let state = await rotateDocked(page, button(page, "Rotate plane Z"), [0, 0, 0], [0, 0, 1], 30);
  const frame = state.preview.constructionPlanes[0].frame;
  if (process.env.MAKESHIFT_WIDGET_TRACE)
    console.log(
      `${name}: plane rotation ${JSON.stringify({ before: rotationBefore, frame, input: state.rotationInput, gesture: state.widgetGesture })}`,
    );
  const rotation = Math.round(state.rotationInput.deliveredAngle * 2) / 2;
  assertRotatedFrame(frame, rotationBefore, rotation);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "construction plane", "construction-plane");
  await pickPlane(page, "XY");
  await button(page, "Rotate plane Z").click();
  await page.getByRole("textbox", { name: "Plane rotation Z", exact: true }).fill("30");
  assertRotatedFrame((await inspect(page)).preview.constructionPlanes[0].frame, rotationBefore, 30);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "construction plane", "construction-plane");
  await pickPlane(page, "XY");
  await button(page, "Move plane X").click();
  await page.getByRole("textbox", { name: "Plane translation X", exact: true }).fill("2");
  state = await inspect(page);
  assert.equal(state.preview.constructionPlanes[0].frame.origin[0], 2);
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  assert.equal(after.constructionPlanes[0].frame.origin[0], 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  const sectionPrevious = (await inspect(page)).crossSection;
  await chooseTool(page, "cross section", "cross-section");
  await pickPlane(page, "XY");
  const sectionBefore = (await inspect(page)).crossSection;
  assert.ok(sectionBefore);
  await sweepWidgets(page, sectionBefore.origin, gizmo, "section plane");
  const a = await project(page, [0, 0, 0]),
    b = await project(page, [1, 0, 0]);
  state = await dragPixels(page, button(page, "Move plane X"), { x: b.x - a.x, y: b.y - a.y });
  const delivered = deliveredAxisDelta(state.widgetGesture, { x: b.x - a.x, y: b.y - a.y });
  if (
    process.env.MAKESHIFT_WIDGET_TRACE ||
    Math.abs(state.crossSection.origin[0] - sectionBefore.origin[0] - delivered) >= 0.001
  )
    console.log(
      `${name}: section input ${JSON.stringify({ before: sectionBefore, actual: state.crossSection, unit: { x: b.x - a.x, y: b.y - a.y }, gesture: state.widgetGesture })}`,
    );
  assertTranslatedFrame(state.crossSection, sectionBefore, 0, delivered);
  await page.getByRole("textbox", { name: "Plane translation X", exact: true }).fill("1");
  const numeric = (await inspect(page)).crossSection;
  assertTranslatedFrame(numeric, sectionBefore, 0, 1);
  assert.deepEqual(state.document, after, "Section placement is view state");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, after);
  assert.deepEqual((await inspect(page)).crossSection, sectionPrevious);
  console.log(
    `${name}: docked construction/section plane rotation and placement, Cancel/history passed`,
  );
}
