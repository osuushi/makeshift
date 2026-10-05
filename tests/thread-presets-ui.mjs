import assert from "node:assert/strict";
import { openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { decoratorPresetRoute } from "./ui-decorator-presets.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await decoratorCylinder(page);
    await chooseTool(page, "threads", "threads");
    const original = (await inspect(page)).document;
    await decoratorPresetRoute(page, name);
    await openDocument(page, {
      name: "unchanged-thread-control.makeshift",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document: original })),
    });
    const roundtrip = (await inspect(page)).document;
    assert.deepEqual(roundtrip.decorators, original.decorators);
    assert.equal(roundtrip.bodies[0].id, original.bodies[0].id);
    assert.deepEqual(
      roundtrip.bodies[0].faces.map(({ id }) => id),
      original.bodies[0].faces.map(({ id }) => id),
    );
    assert.deepEqual(
      roundtrip.bodies[0].edges.map(({ id }) => id),
      original.bodies[0].edges.map(({ id }) => id),
    );
    close(roundtrip.bodies[0].volume, original.bodies[0].volume);
    for (let i = 0; i < 6; i++) close(roundtrip.bodies[0].bounds[i], original.bodies[0].bounds[i]);
    console.log(
      `${name}: unchanged-file BRep serialization ${roundtrip.bodies[0].brep === original.bodies[0].brep ? "identical" : "canonicalized"}; stable topology/volume/bounds verified`,
    );
    for (const preset of ["print-upright", "print-sideways"]) {
      const savedSettings = {
        ...original.decorators[0].settings,
        preset,
        pitch: 3.7,
        profile: "rounded",
        clearance: 0.37,
        hand: "left",
        cut: "hole",
        start: 0.4,
        end: 0.6,
        startTaper: 0.2,
        endTaper: 0.3,
        layerHeight: 0.23,
        nozzleDiameter: 0.71,
      };
      const legacy = {
        ...original,
        decorators: [{ ...original.decorators[0], settings: savedSettings }],
      };
      await openDocument(page, {
        name: "legacy-orientation-preset.makeshift",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document: legacy })),
      });
      const expected = { ...savedSettings, preset: "custom" };
      let state = await inspect(page);
      assert.deepEqual(state.document.decorators[0].settings, expected);
      assert.deepEqual(
        state.document.bodies,
        roundtrip.bodies,
        "Retired-preset load matches unchanged-file exact geometry and topology",
      );
      await orient(page, [0, -1, 0.3]);
      await worldClick(page, [0, -8, 5]);
      const selector = page.getByRole("combobox", { name: "Preset", exact: true });
      assert.equal(await selector.inputValue(), "custom");
      assert.deepEqual(await selector.locator("option").allTextContents(), [
        "FDM fine",
        "FDM coarse",
        "Metric",
        "Custom",
      ]);
      assert.equal(
        await page.getByRole("spinbutton", { name: "Layer height", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("spinbutton", { name: "Nozzle diameter", exact: true }).count(),
        0,
      );
      await page.getByRole("combobox", { name: "Handedness", exact: true }).selectOption("right");
      state = await inspect(page);
      assert.deepEqual(state.document.decorators[0].settings, { ...expected, hand: "right" });
      await chooseTool(page, "undo", "undo");
      assert.deepEqual((await inspect(page)).document.decorators[0].settings, expected);
    }
    console.log(
      `${name}: four thread presets, no orientation inputs, numeric cancel/Undo and both legacy presets open/edit without dimension changes passed`,
    );
  },
  { timeout: 30000 },
);
