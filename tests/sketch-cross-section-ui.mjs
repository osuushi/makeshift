import assert from "node:assert/strict";
import { makePlate } from "./ui-face-offset.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Tool availability and sketch workspace handoff cross controller boundaries;
// geometry-only tests cannot catch the former Modeling-only command guard.
await withUiRuntimes(async (page) => {
  const original = await makePlate(page);
  for (const [plane, axis] of [
    ["XZ", 1],
    ["YZ", 0],
  ]) {
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    const before = await inspect(page);
    const history = await page.evaluate(() => window.makeshiftHistory());
    await chooseTool(page, "cross section", "cross-section");
    const state = await inspect(page);
    assert.equal(state.activePlane, before.activePlane);
    assert.equal(state.interaction, null, "Sketching stays available without plane placement");
    assert.deepEqual(state.crossSection.origin, [0, 0, 0]);
    assert.equal(Math.abs(state.clipping[0][axis]), 1, "Cut uses the current sketch normal");
    assert.deepEqual(state.document, original);
    assert.deepEqual(await page.evaluate(() => window.makeshiftHistory()), history);
    await page.getByRole("button", { name: "Flip side", exact: true }).click();
    assert.equal((await inspect(page)).clipping[0][axis], -state.clipping[0][axis]);
    await chooseTool(page, "return to modeling", "modeling");
  }
  await chooseTool(page, "Sketch on YZ", "sketch-yz");
  await page.getByRole("button", { name: "Turn off section", exact: true }).click();
  assert.equal((await inspect(page)).crossSection, null);
  await chooseTool(page, "cross section", "cross-section");
  await page.keyboard.press("r");
  await drag(page, [15, 15], [20, 20]);
  const drawn = await inspect(page);
  assert.equal(drawn.document.sketches.length, original.sketches.length + 1);
  assert.ok(drawn.crossSection, "Drawing preserves the cut");
  console.log(
    "Sketch cross section activation, replacement, flip/off and continued drawing passed",
  );
});
