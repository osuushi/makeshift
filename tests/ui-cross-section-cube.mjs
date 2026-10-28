import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { cubeSettled } from "./ui-orientation-cube-clicks.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Cube navigation does not select a plane: exercise the real tool handoff.
export async function cubeSectionFallback(page) {
  for (const [face, axis, direction] of [
    ["Top", 2, [1, -1, 1]],
    ["Bottom", 2, [1, -1, -1]],
    ["Front", 1, [1, -1, 1]],
    ["Back", 1, [1, 1, 1]],
    ["Right", 0, [1, -1, 1]],
    ["Left", 0, [-1, -1, 1]],
  ]) {
    await reset(page);
    await orient(page, direction);
    await page.getByRole("button", { name: `${face} view`, exact: true }).click();
    await cubeSettled(page);
    assert.ok((await inspect(page)).planeTargets.every((plane) => !plane.selected));
    await chooseTool(page, "cross section", "cross-section");
    const section = (await inspect(page)).crossSection;
    assert.ok(section, `${face} view supplies a section without a plane pick`);
    assert.deepEqual(section.origin, [0, 0, 0]);
    assert.equal(Math.abs(section.u[axis]), 0);
    assert.equal(Math.abs(section.v[axis]), 0);
    await page.keyboard.press("Escape");
    assert.equal((await inspect(page)).crossSection, null);
  }
}
