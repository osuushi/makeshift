import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { resizeGroupedGear } from "./ui-gear-group-resize.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// The escaped boundary is panel event wiring: a gear-group click must reveal
// membership and Add selection must reach the owner as an atomic group edit.
const fixture = JSON.parse(await readFile("tests/fixtures/gear-cylinders.json", "utf8"));
await withUiRuntimes(
  async (page, name) => {
    await openDocument(page, {
      name: "gear-cylinders.makeshift",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "makeshift",
          version: 1,
          document: { ...fixture.document, decorators: [] },
        }),
      ),
    });
    await settled(page);
    await orient(page, [0, -1, 0.4]);
    await worldClick(page, [10, -23, 2]);
    await chooseTool(page, "gear", "gear");
    let state = await inspect(page);
    assert.equal(state.document.decorators.length, 1);
    const groups = page.getByRole("region", { name: "Gear groups", exact: true });
    // <section aria-label> is exposed as a region in the accessibility tree.
    await groups.getByRole("button", { name: "Gears 1 · 1 gear", exact: true }).click();
    assert.equal(await groups.getByRole("listitem").count(), 1);
    await worldClick(page, [-10, -17, 2]);
    await groups.getByRole("button", { name: "Add selection to Gears 1", exact: true }).click();
    state = await inspect(page);
    assert.deepEqual(
      state.document.decorators.map((d) => d.settings.teeth),
      [39, 21],
    );
    assert.equal(state.document.decorators[0].gearGroup, state.document.decorators[1].gearGroup);
    await groups.getByRole("button", { name: "Gears 1 · 2 gears", exact: true }).click();
    // The group was already expanded before adding; click again to reveal it.
    if (!(await groups.getByRole("list", { name: "Gear group members" }).count()))
      await groups.getByRole("button", { name: "Gears 1 · 2 gears", exact: true }).click();
    assert.equal(await groups.getByRole("listitem").count(), 2);
    state = await inspect(page);
    assert.equal(state.modelingSelection.length, 2);
    const maximum = page.getByRole("spinbutton", { name: "Maximum normal module", exact: true });
    await maximum.fill("0.5");
    await maximum.press("Escape");
    assert.deepEqual(
      (await inspect(page)).document.decorators.map((d) => d.settings.teeth),
      [39, 21],
    );
    const minimum = page.getByRole("spinbutton", { name: "Minimum tooth tip width", exact: true });
    await minimum.fill("0.3");
    await minimum.press("Enter");
    await inspect(page);
    await maximum.fill("0.5");
    await maximum.press("Enter");
    assert.deepEqual(
      (await inspect(page)).document.decorators.map((d) => d.settings.teeth),
      [52, 28],
    );
    await chooseTool(page, "undo", "undo");
    assert.deepEqual(
      (await inspect(page)).document.decorators.map((d) => d.settings.teeth),
      [39, 21],
    );
    await worldClick(page, [-10, -17, 2]);
    await page
      .getByRole("button", { name: "Remove Gear decorator from selected faces", exact: true })
      .click();
    assert.equal((await inspect(page)).document.decorators.length, 1);
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.decorators.length, 2);
    await resizeGroupedGear(page);
    await groups.getByRole("button", { name: "Gears 1 · 2 gears", exact: true }).click();
    if (!(await groups.getByRole("list", { name: "Gear group members" }).count()))
      await groups.getByRole("button", { name: "Gears 1 · 2 gears", exact: true }).click();
    const groupBox = await groups.boundingBox();
    const settingsBox = await page
      .getByRole("region", { name: "Decorators", exact: true })
      .boundingBox();
    assert.ok(
      settingsBox.y >= groupBox.y + groupBox.height,
      "Group membership and settings must not overlap",
    );
    await page.screenshot({ path: `.cache/sketch-review/${name}-gear-groups.png` });
    console.log(
      `${name}: captured cylinders, membership disclosure, add, shared sizing, cancellation, removal and Undo passed`,
    );
  },
  { timeout: 30000 },
);
