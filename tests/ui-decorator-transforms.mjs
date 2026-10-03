import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function decoratorTransformRoute(page) {
  const before = (await inspect(page)).document;
  const settings = before.decorators[0].settings;
  const bodyId = before.bodies[0].id;
  await page.waitForFunction(
    (id) => window.makeshiftInspect().decoratorPreviewBounds.some((bounds) => bounds.body === id),
    bodyId,
  );
  const originalBounds = (await inspect(page)).decoratorPreviewBounds.find(
    (b) => b.body === bodyId,
  );
  const originalWidth = originalBounds.max[0] - originalBounds.min[0];
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.locator(".transform-box-handle:not([hidden])").first().click();
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
  let state = await inspect(page);
  assert.deepEqual(state.document, before);
  assert.deepEqual(state.preview.decorators[0].settings, settings);
  assert.equal(state.preview.decorators[0].problem, undefined);
  await page.waitForFunction(
    ({ id, width }) => {
      const bounds = window.makeshiftInspect().decoratorPreviewBounds.find((b) => b.body === id);
      return bounds && bounds.max[0] - bounds.min[0] > width * 1.3;
    },
    { id: bodyId, width: originalWidth },
  );
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  state = await inspect(page);
  assert.ok(state.document.bodies[0].volume > before.bodies[0].volume * 3);
  assert.deepEqual(state.document.decorators[0].settings, settings);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await movePreviewRoute(page, before, bodyId, originalBounds);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.locator(".transform-box-handle:not([hidden])").first().click();
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).uncheck();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
  await inspect(page);
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  state = await inspect(page);
  assert.match(state.document.decorators[0].problem, /cylindrical/);
  const repair = page.getByRole("button", {
    name: "Use selected faces for these threads",
    exact: true,
  });
  assert.ok(await repair.isDisabled());
  await page.getByRole("button", { name: "Select affected geometry", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection[0].kind, "face");
  assert.ok(await repair.isDisabled());
  await page
    .getByRole("button", { name: "Remove unresolved thread decorator", exact: true })
    .click();
  assert.equal((await inspect(page)).document.decorators.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.match((await inspect(page)).document.decorators[0].problem, /cylindrical/);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await clearSelection(page);
}

async function movePreviewRoute(page, before, bodyId, originalBounds) {
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("5");
  const state = await inspect(page);
  assert.deepEqual(state.document, before);
  assert.equal(state.preview.decorators[0].problem, undefined);
  assert.ok(
    Math.abs(
      state.preview.decorators[0].frame.origin[0] - before.decorators[0].frame.origin[0] - 5,
    ) < 1e-7,
  );
  await page.waitForFunction(
    ({ id, x }) => {
      const bounds = window.makeshiftInspect().decoratorPreviewBounds.find((b) => b.body === id);
      return bounds && Math.abs(bounds.min[0] - x - 5) < 0.1;
    },
    { id: bodyId, x: originalBounds.min[0] },
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await page.waitForFunction(
    ({ id, x }) => {
      const bounds = window.makeshiftInspect().decoratorPreviewBounds.find((b) => b.body === id);
      return bounds && Math.abs(bounds.min[0] - x) < 0.1;
    },
    { id: bodyId, x: originalBounds.min[0] },
  );
  const handle = await page.getByRole("button", { name: "Move body X", exact: true }).boundingBox();
  assert.ok(handle);
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const livePositions = new Set();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(start.x + [24, 48, 72, 48][i % 4], start.y);
    await page.waitForTimeout(55);
    const bounds = await page.evaluate(
      (id) => window.makeshiftInspect().decoratorPreviewBounds.find((b) => b.body === id),
      bodyId,
    );
    if (bounds && Math.abs(bounds.min[0] - originalBounds.min[0]) > 0.1)
      livePositions.add(bounds.min[0].toFixed(1));
  }
  assert.ok(livePositions.size >= 2, "overlay must update more than once before drag release");
  await page.mouse.move(start.x + 60, start.y, { steps: 8 });
  const drag = await inspect(page);
  const displacement =
    drag.preview.decorators[0].frame.origin[0] - before.decorators[0].frame.origin[0];
  assert.ok(Math.abs(displacement) > 0.1);
  await page.waitForFunction(
    ({ id, x }) => {
      const bounds = window.makeshiftInspect().decoratorPreviewBounds.find((b) => b.body === id);
      return bounds && Math.abs(bounds.min[0] - x) < 0.1;
    },
    { id: bodyId, x: originalBounds.min[0] + displacement },
  );
  await page.waitForFunction(
    ({ id, triangles }) =>
      window.makeshiftInspect().decoratorPreviewBounds.find((b) => b.body === id)?.triangles ===
      triangles,
    { id: bodyId, triangles: originalBounds.triangles },
  );
  await page.mouse.up();
  assert.notDeepEqual((await inspect(page)).document, before);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}
