import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { previewReady, previewStats } from "./ui-decorator-worker-control.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { circleBody } from "./ui-preview-fallback-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function mixedDisplayRoute(page, original) {
  await circleBody(page, 8, 10, [24, 0]);
  await clearSelection(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [24, -8, 5]);
  await chooseTool(page, "threads", "threads");
  await previewReady(page);
  const display = page.getByRole("combobox", { name: "Decorator display", exact: true });
  await display.selectOption("detailed");
  await page.waitForFunction(
    () => window.makeshiftInspect().document.decorators[1]?.display === "detailed",
  );
  await previewReady(page);
  let state = await inspect(page);
  assert.equal(state.document.decorators.length, 2);
  assert.equal(state.decoratorPreviewBounds.length, 2);
  const originalBody = original.bodies[0].id;
  const supportTriangles =
    original.bodies[0].faces.find((face) => face.cylinder).vertices.length / 9;
  assert.equal(
    state.decoratorPreviewBounds.find((mesh) => mesh.body === originalBody).triangles,
    supportTriangles,
  );
  assert.ok(
    state.decoratorPreviewBounds.find((mesh) => mesh.body !== originalBody).triangles >
      supportTriangles,
    "Texture and Geometry coexist on separate decorators",
  );
  await display.selectOption("color-only");
  await page.waitForFunction(
    () => window.makeshiftInspect().document.decorators[1]?.display === "color-only",
  );
  await previewReady(page);
  state = await inspect(page);
  assert.equal(state.decoratorPreviewBounds.length, 1);
  assert.equal(state.decoratorPreviewBounds[0].body, originalBody);
  assert.equal(state.decoratorFallbackBounds.length, 1);
  const samples = (await previewStats(page)).samples.at(-1).samples;
  assert.deepEqual(
    samples.map((sample) => sample.id),
    [original.decorators[0].id],
    "A color-only decorator is excluded from worker generation beside an active texture",
  );
  await clearSelection(page);
}
