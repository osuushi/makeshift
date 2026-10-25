import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { displaySettings } from "./ui-decorator-display.mjs";
import {
  installPreviewControl,
  previewReady,
  previewStats,
} from "./ui-decorator-worker-control.mjs";
import { inspect } from "./ui-helpers.mjs";
import { cylinder, pickThreadFace, threads } from "./ui-preview-fallback-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

// Manual feature acceptance: real generated geometry and GPU shading cannot be proved by CPU maps.
await withUiRuntimes(
  async (page, name) => {
    await installPreviewControl(page);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.makeshiftInspect));
    await cylinder(page);
    const original = await threads(page);
    await clearSelection(page);
    const history = await page.evaluate(() => window.makeshiftHistory());
    const screenshots = [];
    for (const mode of ["detailed", "texture", "color-only", "texture"]) {
      await displaySettings(page, (dialog) =>
        dialog.getByRole("combobox", { name: "Decorator display", exact: true }).selectOption(mode),
      );
      if (mode !== "color-only") await previewReady(page);
      const state = await inspect(page);
      assert.deepEqual(state.document, original);
      assert.deepEqual(await page.evaluate(() => window.makeshiftHistory()), history);
      if (mode === "texture") {
        const face = original.bodies[0].faces.find((face) => face.cylinder);
        assert.equal(state.decoratorPreviewBounds.length, 1);
        assert.equal(state.decoratorPreviewBounds[0].triangles, face.vertices.length / 9);
        assert.equal(state.decoratorFallbackBounds.length, 0);
        for (let axis = 0; axis < 3; axis++) {
          const coordinates = face.vertices.filter((_, i) => i % 3 === axis);
          assert.ok(
            Math.abs(state.decoratorPreviewBounds[0].min[axis] - Math.min(...coordinates)) < 1e-5,
          );
          assert.ok(
            Math.abs(state.decoratorPreviewBounds[0].max[axis] - Math.max(...coordinates)) < 1e-5,
          );
        }
      }
      if (mode === "color-only") assert.equal(state.decoratorPreviewBounds.length, 0);
      await page.mouse.move(100, 70);
      screenshots.push(
        await page.screenshot({
          path: `.cache/sketch-review/${name}-normal-projection-${mode}.png`,
        }),
      );
    }
    assert.notDeepEqual(
      screenshots[1],
      screenshots[2],
      "Texture shading differs from flat coloring",
    );
    assert.deepEqual(
      screenshots[1],
      screenshots[3],
      "Repeated mode changes restore the same projection",
    );
    await pickThreadFace(page, original);
    await clearSelection(page);
    for (const direction of [
      [1, -1, 0.5],
      [-1, 0.1, 0.3],
    ]) {
      await orient(page, direction);
      await page.screenshot({
        path: `.cache/sketch-review/${name}-normal-projection-angle-${direction[0]}.png`,
      });
    }
    console.log(
      `${name}: normal projection mode, support silhouette, picking, history and repeat switching passed`,
      await previewStats(page),
    );
  },
  { timeout: 30000 },
);
