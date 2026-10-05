import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function knurlMembershipRoute(page) {
  await clearSelection(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [2, -2, 10]);
  await chooseTool(page, "construction plane", "construction-plane");
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation Z", exact: true }).fill("-5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await clearSelection(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -8, 2]);
  const before = (await inspect(page)).document.decorators[0];
  await chooseTool(page, "imprint", "imprint");
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).first().click();
  await inspect(page);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.decorators[0].faces.length, 2);
  await page.getByRole("button", { name: "Hide Plane 1", exact: true }).click();
  await clearSelection(page);
  await worldClick(page, [0, -8, 2]);
  await page
    .getByRole("button", { name: "Remove knurling decorator from selected faces", exact: true })
    .click();
  let state = await inspect(page);
  assert.equal(state.document.decorators[0].faces.length, 1);
  assert.deepEqual(state.document.decorators[0].frame, before.frame);
  await page.waitForFunction(() =>
    window.makeshiftInspect().decoratorPreviewBounds.some((b) => b.min[2] >= 4.99),
  );
  await page.getByRole("button", { name: "Continue knurling onto selection", exact: true }).click();
  state = await inspect(page);
  assert.equal(state.document.decorators[0].faces.length, 2);
  await page.getByRole("button", { name: "Knurling · 2 faces", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  const depth = page.getByRole("spinbutton", { name: "Knurl depth", exact: true });
  await depth.fill("0.4");
  await depth.press("Enter");
  assert.equal((await inspect(page)).document.decorators[0].settings.depth, 0.4);
  await clearSelection(page);
  await worldClick(page, [0, -8, 2]);
  await page
    .getByRole("button", { name: "Remove knurling decorator from selected faces", exact: true })
    .click();
  assert.equal((await inspect(page)).document.decorators[0].faces.length, 1);
  await worldClick(page, [0, -8, 8]);
}

export async function knurlMoveRoute(page) {
  const before = (await inspect(page)).document;
  const bodyId = before.bodies[0].id;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("12");
  await page.waitForFunction(
    (id) =>
      window.makeshiftInspect().decoratorPreviewBounds.some((b) => b.body === id && b.min[0] > 3),
    bodyId,
  );
  await page.keyboard.press("Enter");
  let state = await inspect(page);
  assert.deepEqual(state.document.decorators[0].settings, before.decorators[0].settings);
  assert.equal(state.document.decorators[0].problem, undefined);
  assert.ok(
    Math.abs(
      state.document.decorators[0].frame.origin[0] - before.decorators[0].frame.origin[0] - 12,
    ) < 1e-7,
  );
  await chooseTool(page, "undo", "undo");
  state = await inspect(page);
  assert.deepEqual(state.document, before);
  await clearSelection(page);
  await worldClick(page, [0, -8, 5]);
}
