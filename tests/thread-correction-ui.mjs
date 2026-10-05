import assert from "node:assert/strict";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await decoratorCylinder(page, 10);
    await chooseTool(page, "threads", "threads");
    const before = (await inspect(page)).document.decorators[0];
    assert.equal(before.settings.preset, "fdm-fine");
    await page.getByRole("button", { name: "Offset faces", exact: true }).click();
    await (await relativeOffsetInput(page)).fill("-9.5");
    await previewActionReady(page, "Accept face offset");
    await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
    const resized = (await inspect(page)).document;
    assert.match(resized.decorators[0].problem, /too deep/);
    await worldClick(page, [25, 0, 5]);
    const panel = page.getByRole("region", { name: "Decorators", exact: true });
    assert.equal(await panel.isVisible(), false);
    assert.equal(
      (await inspect(page)).bodyRendering.faces.filter((f) => f.decoratorInvalid).length,
      1,
    );
    await page.screenshot({ path: `.cache/sketch-review/${name}-thread-error-deselected.png` });
    await worldClick(page, [0, -0.5, 5]);
    assert.equal(await panel.isVisible(), true);
    assert.match(await panel.innerText(), /Threads need correction/);
    assert.equal(
      await page.getByRole("button", { name: "Use selected faces for these threads" }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("spinbutton", { name: "Pitch", exact: true }).isVisible(),
      true,
    );
    await page.screenshot({ path: `.cache/sketch-review/${name}-thread-error-editor.png` });
    // Radius recovery must clear the error in both temporary and accepted geometry.
    await page.getByRole("button", { name: "Offset faces", exact: true }).click();
    await (await relativeOffsetInput(page)).fill("5");
    await previewActionReady(page, "Accept face offset");
    assert.equal((await inspect(page)).preview.decorators[0].problem, undefined);
    await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
    const restored = (await inspect(page)).document;
    assert.equal(restored.decorators[0].problem, undefined);
    assert.deepEqual(restored.decorators[0].settings, before.settings);
    assert.equal(
      (await inspect(page)).bodyRendering.faces.some((f) => f.decoratorInvalid),
      false,
    );
    for (const label of [
      "Select affected geometry",
      "Use selected faces for these threads",
      "Remove unresolved thread decorator",
    ])
      assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 0);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, resized);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, restored);
    await chooseTool(page, "undo", "undo");
    await page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("metric");
    const corrected = (await inspect(page)).document;
    assert.equal(corrected.decorators[0].problem, undefined);
    assert.equal(
      (await inspect(page)).bodyRendering.faces.some((f) => f.decoratorInvalid),
      false,
    );
    assert.equal(corrected.decorators[0].id, before.id);
    assert.deepEqual(corrected.bodies, resized.bodies);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, resized);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, corrected);
    console.log(
      `${name}: invalid thread fields, radius recovery in preview/acceptance, no thread repair controls, settings correction and Undo/Redo passed`,
    );
  },
  { timeout: 30000 },
);
