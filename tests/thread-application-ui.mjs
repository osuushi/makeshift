import assert from "node:assert/strict";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    const original = await decoratorCylinder(page, 0.5, 1);
    const panel = page.getByRole("region", { name: "Decorators", exact: true });
    const apply = page.getByRole("button", { name: "Create threads", exact: true });
    await chooseTool(page, "threads", "threads");
    assert.match(await panel.innerText(), /Thread profile is too deep/);
    assert.equal(await apply.isDisabled(), true);
    assert.deepEqual((await inspect(page)).document, original);
    assert.equal((await inspect(page)).preview, null);
    const profile = page.getByRole("combobox", { name: "Profile", exact: true });
    await profile.selectOption("metric");
    assert.match(await panel.innerText(), /Thread profile is too deep/);
    const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
    await pitch.fill("0.25");
    assert.equal(await apply.isEnabled(), true);
    let state = await inspect(page);
    assert.deepEqual(state.document, original);
    assert.equal(state.preview.decorators[0].settings.pitch, 0.25);
    assert.equal(state.preview.decorators[0].settings.profile, "metric");
    await pitch.fill("0");
    assert.equal(await apply.isDisabled(), true);
    assert.equal((await inspect(page)).preview, null);
    assert.match(await panel.innerText(), /Invalid thread pitch/);
    await pitch.fill("0.25");
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual((await inspect(page)).document, original);
    assert.equal((await inspect(page)).interaction, null);
    await chooseTool(page, "threads", "threads");
    await page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("metric");
    state = await inspect(page);
    assert.deepEqual(state.document, original);
    assert.equal(state.preview.decorators[0].settings.pitch, 0.25);
    await page.getByRole("spinbutton", { name: "Clearance", exact: true }).fill("0.15");
    await apply.click();
    state = await inspect(page);
    assert.equal(state.document.decorators.length, 1);
    assert.equal(state.document.decorators[0].settings.clearance, 0.15);
    assert.equal(state.document.decorators[0].settings.profile, "metric");
    assert.equal(state.document.decorators[0].settings.pitch, 0.25);
    assert.deepEqual(state.document.bodies, original.bodies);
    assert.equal(state.interaction, null);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.equal((await inspect(page)).document.decorators.length, 1);
    await chooseTool(page, "undo", "undo");
    await chooseTool(page, "threads", "threads");
    await pitch.press("Escape");
    assert.deepEqual((await inspect(page)).document, original);
    assert.equal((await inspect(page)).interaction, null);
    // Existing valid application remains immediate and remains editable/reselectable.
    await decoratorCylinder(page, 8);
    await chooseTool(page, "threads", "threads");
    assert.equal((await inspect(page)).document.decorators.length, 1);
    assert.equal(await apply.count(), 0);
    await page.getByRole("button", { name: "Offset faces", exact: true }).click();
    assert.equal(
      await page.getByRole("combobox", { name: "Preset", exact: true }).isDisabled(),
      true,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("metric");
    assert.equal((await inspect(page)).document.decorators[0].settings.preset, "metric");
    assert.equal(await toolEnabled(page, "threads", "threads"), true);
    console.log(
      `${name}: invalid defaults open correction settings; numeric validation/preview, Apply, Cancel, Escape, one-step Undo/Redo and valid existing route passed`,
    );
  },
  { timeout: 30000 },
);
