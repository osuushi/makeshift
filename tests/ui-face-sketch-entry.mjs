import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { assertNavigation, navigationHistory, navigationIdle } from "./ui-navigation-history.mjs";
import { chooseTool } from "./ui-tools.mjs";

/** Escaped integration: Sketch on face must retain a zoomed-in edge, through navigation history. */
export async function faceSketchEntryRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  const center = await at(page, 1, 1);
  await chooseTool(page, "Return to Modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const distance = page.getByRole("textbox", { name: "Extrusion distance" });
  if (!(await distance.isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await distance.fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  await orient(page, [0.15, -0.2, 1]);
  const edge = await project(page, [8, 0, 10]);
  await page.mouse.move(edge.x, edge.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -150);
  await page.keyboard.up("Control");
  await page.waitForFunction(() => window.makeshiftInspect().camera.height < 5);
  const box = await page.locator("canvas").boundingBox();
  assert.ok(box);
  await page.mouse.click(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20);
  const before = await navigationIdle(page);
  assert.equal(before.modelingSelection[0]?.kind, "face");
  const { position, target } = before.camera;
  const t = (10 - target[2]) / (position[2] - target[2]);
  const anchor = target.map((n, i) => n + t * (position[i] - n));
  assert.ok(Math.hypot(anchor[0], anchor[1]) > 6, "Setup looks near the face edge");
  const projectedBefore = await project(page, anchor);
  await chooseTool(page, "Sketch on face", "sketch-on-face");
  const entered = await navigationIdle(page);
  close(entered.camera.height, before.camera.height, "Face entry retains close zoom");
  for (const [i, n] of entered.camera.target.entries())
    close(n, anchor[i], "Face entry keeps viewed edge");
  const projectedAfter = await project(page, anchor);
  close(projectedAfter.x, projectedBefore.x, "Viewed point retains screen X");
  close(projectedAfter.y, projectedBefore.y, "Viewed point retains screen Y");
  assert.deepEqual(entered.document, before.document);
  assertNavigation(await navigationHistory(page), before, "Face-entry Undo");
  assertNavigation(await navigationHistory(page, true), entered, "Face-entry Redo");
}
