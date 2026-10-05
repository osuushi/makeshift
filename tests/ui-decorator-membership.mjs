import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { openThreadAdvanced } from "./ui-decorator-advanced.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function imprintThreadedCylinder(page) {
  await clearSelection(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [2, -2, 10]);
  await chooseTool(page, "construction plane", "construction-plane");
  assert.equal((await inspect(page)).document.constructionPlanes.length, 1);
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation Z", exact: true }).fill("-5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await clearSelection(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -8, 2]);
  await chooseTool(page, "threads", "threads");
  await openThreadAdvanced(page);
  for (const [name, value] of [
    ["Start inset", "1"],
    ["End inset", "2"],
    ["Start taper", "2"],
  ]) {
    const input = page.getByRole("spinbutton", { name, exact: true });
    await input.fill(value);
    await input.press("Enter");
    await inspect(page);
  }
  const before = (await inspect(page)).document.decorators[0];
  await chooseTool(page, "imprint", "imprint");
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).first().click();
  await inspect(page);
  await page.keyboard.press("Enter");
  const state = await inspect(page);
  assert.equal(state.document.decorators[0].faces.length, 2);
  assert.deepEqual(state.document.decorators[0].frame, before.frame);
  await page.getByRole("button", { name: "Hide Plane 1", exact: true }).click();
  await clearSelection(page);
  return before;
}

export async function decoratorMembershipRoute(page) {
  const original = await imprintThreadedCylinder(page);
  await worldClick(page, [0, -8, 2]);
  await page.getByRole("button", { name: "Threads · 2 faces", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await page.getByRole("button", { name: "Show Plane 1", exact: true }).click();
  await chooseTool(page, "split body", "split");
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).first().click();
  await inspect(page);
  await page.keyboard.press("Enter");
  const split = await inspect(page);
  assert.equal(split.document.bodies.length, 2);
  assert.equal(split.document.decorators.length, 2);
  assert.ok(
    split.document.decorators.every(
      (d) => !d.problem && d.settings.start === 1 && d.settings.startTaper === 2,
    ),
  );
  assert.ok(
    split.document.decorators.every((d) => d.axialReference[0] === 0 && d.axialReference[1] === 10),
  );
  await unrelatedPreviewDuringMove(page, split.document);
  let unsplit;
  for (let i = 0; i < 4; i++) {
    await chooseTool(page, "undo", "undo");
    unsplit = await inspect(page);
    if (unsplit.document.bodies.length === 1) break;
  }
  assert.equal(unsplit.document.bodies.length, 1);
  assert.equal(unsplit.document.decorators.length, 1);
  await page.getByRole("button", { name: "Hide Plane 1", exact: true }).click();
  await clearSelection(page);
  await worldClick(page, [0, -8, 2]);
  await page
    .getByRole("button", { name: "Remove thread decorator from selected faces", exact: true })
    .click();
  let state = await inspect(page);
  assert.equal(state.document.decorators.length, 1);
  assert.equal(state.document.decorators[0].faces.length, 1);
  assert.deepEqual(state.document.decorators[0].frame, original.frame);
  assert.equal(state.modelingSelection.length, 1);
  assert.equal(state.modelingSelection[0].kind, "face");
  await page.getByRole("button", { name: "Continue threads onto selection", exact: true }).click();
  state = await inspect(page);
  assert.equal(state.document.decorators[0].faces.length, 2);
  await openThreadAdvanced(page);
  const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
  await pitch.fill("3");
  await pitch.press("Enter");
  state = await inspect(page);
  assert.equal(state.modelingSelection.length, 2, "Editing expands to all affected faces");
  assert.equal(state.document.decorators[0].settings.pitch, 3);
  assert.equal(state.document.decorators[0].settings.preset, "custom");
  await clearSelection(page);
  await worldClick(page, [0, -8, 2]);
  await page
    .getByRole("button", { name: "Remove thread decorator from selected faces", exact: true })
    .click();
  await inspect(page);
  await chooseTool(page, "threads", "threads");
  await worldClick(page, [0, -8, 8], true);
  state = await inspect(page);
  assert.equal(state.modelingSelection.length, 2);
  assert.equal(state.document.decorators.length, 2);
  assert.equal(await pitch.getAttribute("placeholder"), "Mixed");
  const relief = page.getByRole("spinbutton", { name: "Clearance", exact: true });
  await relief.fill("0.15");
  await relief.press("Enter");
  state = await inspect(page);
  assert.deepEqual(state.document.decorators.map((d) => d.settings.pitch).sort(), [1, 3]);
  assert.ok(state.document.decorators.every((d) => d.settings.clearance === 0.15));
  const beforeCleanup = state.document;
  await chooseTool(page, "clean up", "cleanup");
  state = await inspect(page);
  assert.deepEqual(state.preview, beforeCleanup, "Cleanup keeps the boundary between instances");
  await page.getByRole("button", { name: "Accept cleanup", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, beforeCleanup);
}

async function unrelatedPreviewDuringMove(page, document) {
  const [moving, untouched] = document.bodies.map(({ id }) => id);
  await page.waitForFunction(
    (ids) =>
      ids.every((id) =>
        window.makeshiftInspect().decoratorPreviewBounds.some((b) => b.body === id),
      ),
    [moving, untouched],
  );
  const before = (await inspect(page)).decoratorPreviewBounds;
  const movingBefore = before.find((bounds) => bounds.body === moving);
  const untouchedBefore = before.find((bounds) => bounds.body === untouched);
  assert.ok(movingBefore && untouchedBefore);
  await clearSelection(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("5");
  await page.waitForFunction(
    ({ body, x }) =>
      window
        .makeshiftInspect()
        .decoratorPreviewBounds.some(
          (bounds) => bounds.body === body && Math.abs(bounds.min[0] - x - 5) < 0.1,
        ),
    { body: moving, x: movingBefore.min[0] },
  );
  const during = (await inspect(page)).decoratorPreviewBounds;
  assert.equal(
    during.find((bounds) => bounds.body === untouched)?.mesh,
    untouchedBefore.mesh,
    "Moving another body must not replace the untouched decoration preview",
  );
  await page.keyboard.press("Enter");
  assert.notDeepEqual((await inspect(page)).document, document);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, document);
  await clearSelection(page);
}
