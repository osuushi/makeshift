import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import {
  activeModelingHistoryChecks,
  captureAcceptedRotation,
} from "./ui-modeling-history-checks.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function numericPlacement(page, action, axis, value) {
  await page.getByRole("button", { name: `${action} sketch ${axis}`, exact: true }).click();
  await page
    .getByRole("textbox", {
      name: `${action === "Move" ? "Translation" : "Rotation"} ${axis}`,
      exact: true,
    })
    .fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
export async function modelingRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [3, 0]);
  const original = (await inspect(page)).document.sketches[0];
  const holeRadius = original.curves.find((curve) => curve.kind === "circle").radius;
  const holeArea = Math.PI * holeRadius ** 2;
  const outside = await at(page, 8, 0),
    // The axis sphere can dock over the circle center. Pick visible profile interior.
    hole = await at(page, -holeRadius / 2, holeRadius / 4);
  await chooseTool(page, "return to modeling", "modeling");
  assert.equal(await page.locator(".mode-label").textContent(), "Modeling");
  assert.equal(await page.getByRole("button", { name: "Rectangle (R)" }).isVisible(), false);
  await page.mouse.click(outside.x, outside.y);
  let selected = (await inspect(page)).modelingSelection;
  assert.equal(selected[0].kind, "profile");
  assert.equal(selected[0].holes, 1);
  close(selected[0].area, 600 - holeArea);
  await page.screenshot({ path: `.cache/sketch-review/${name}-selected-profile.png` });
  await page.evaluate(() => {
    window.addEventListener(
      "pointerdown",
      (event) => {
        window.profileSelectionHit = event.target?.outerHTML?.slice(0, 240);
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.down("Shift");
  await page.mouse.click(hole.x, hole.y);
  await page.keyboard.up("Shift");
  selected = (await inspect(page)).modelingSelection;
  assert.equal(
    selected.length,
    2,
    JSON.stringify({ hit: await page.evaluate(() => window.profileSelectionHit), selected }),
  );
  close(selected[1].area, holeArea);
  await chooseTool(page, "transform", "transform");
  await orient(page, [1, 1, 1]);
  await numericPlacement(page, "Move", "Z", 10);
  let moved = (await inspect(page)).document.sketches[0];
  assert.deepEqual(moved.plane.origin, [0, 0, 10]);
  assert.deepEqual(moved.curves, original.curves);
  const { beforeRotation, rotationId } = await captureAcceptedRotation(page, () =>
    numericPlacement(page, "Rotate", "X", 30),
  );
  moved = (await inspect(page)).document.sketches[0];
  close(moved.plane.v[2], 0.5);
  assert.deepEqual(moved.constraints, original.constraints);
  await page.getByRole("button", { name: "Move sketch X", exact: true }).click();
  await page.getByRole("textbox", { name: "Translation X", exact: true }).fill("50");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document.sketches[0], moved);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0].plane.v, [0, 1, 0]);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document.sketches[0], moved);
  await placementDragChecks(page, moved);
  await activeModelingHistoryChecks(page, beforeRotation, rotationId);
  assert.equal((await inspect(page)).activeSketch, original.id);
  assert.equal(await page.locator(".mode-label").textContent(), "Sketching");
  await page.keyboard.press("l");
  await drag(page, [20, 0], [30, 0]);
  assert.equal((await inspect(page)).document.sketches.length, 1);
  const returnPoint = await at(page, 8, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(returnPoint.x, returnPoint.y);
  await chooseTool(page, "new sketch on this plane", "new-sketch-on-plane");
  await page.keyboard.press("l");
  await drag(page, [-30, 0], [-20, 0]);
  const two = (await inspect(page)).document.sketches;
  assert.equal(two.length, 2);
  assert.notEqual(two[0].id, two[1].id);
  assert.deepEqual(two[0].plane, two[1].plane);
  assert.equal(two[0].curves.length, original.curves.length + 1);
  assert.equal(two[1].curves.length, 1);
  const line = await at(page, -27, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.dblclick(line.x, line.y);
  assert.equal((await inspect(page)).activeSketch, two[1].id);
  await page.screenshot({ path: `.cache/sketch-review/${name}-moved-sketch.png` });
  await deleteSketchCheck(page, line, two[1].id);
  console.log(
    `${name}: modeling profiles/holes, independent placement, cancellation/history and coplanar identity passed`,
  );
}

async function placementDragChecks(page, original) {
  const button = await page
    .getByRole("button", { name: "Move sketch Y", exact: true })
    .boundingBox();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  const a = await project(page, [0, 0, 0]),
    b = await project(page, [0, 10, 0]);
  await page.mouse.move(
    button.x + button.width / 2 + b.x - a.x,
    button.y + button.height / 2 + b.y - a.y,
    { steps: 8 },
  );
  await page.mouse.up();
  const moved = (await inspect(page)).document.sketches[0];
  close(moved.plane.origin[1], 10);
  assert.deepEqual(moved.curves, original.curves);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0], original);
  await page.getByRole("button", { name: "Rotate sketch Z", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Rotation Z", exact: true });
  await input.fill("invalid");
  await page.keyboard.press("Enter");
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.deepEqual((await inspect(page)).document.sketches[0], original);
  await page.keyboard.press("Escape");
}

async function deleteSketchCheck(page, point, id) {
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(point.x, point.y);
  assert.equal((await inspect(page)).modelingSelection[0].kind, "sketch");
  await chooseTool(page, "delete", "delete");
  assert.equal(
    (await inspect(page)).document.sketches.some((s) => s.id === id),
    false,
  );
  await chooseTool(page, "undo", "undo");
  assert.equal(
    (await inspect(page)).document.sketches.some((s) => s.id === id),
    true,
  );
  await page.mouse.dblclick(point.x, point.y);
  assert.equal((await inspect(page)).activeSketch, id);
}
