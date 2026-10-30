import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { orient, pick, readout } from "./ui-measurement.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function pickTop(page, shift = false) {
  for (const x of [-7, 0, 7])
    for (const y of [-7, 0, 7]) {
      const p = await project(page, [x, y, 10]);
      const clear = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS",
        p,
      );
      if (clear) return pick(page, [x, y, 10], shift);
    }
  assert.fail("Top face must have an exposed canvas point outside overlay controls");
}

// Plane capture handlers and model Shift-click handlers must preserve each other's
// selection; native measurement tests cannot exercise that event ordering.
export async function planeMeasurementRoute(page) {
  await plate(page);
  await clearSelection(page);
  await orient(page, [0.4, -1, 0.7]);
  await pickTop(page);
  await chooseTool(page, "construction plane", "construction-plane");
  await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation Z", exact: true }).fill("15");
  await page.keyboard.press("Enter");
  await settled(page);
  const plane = page.getByRole("button", { name: "Select Plane 1", exact: true }).first();
  await pickTop(page, true);
  assert.equal(await plane.getAttribute("aria-pressed"), "true");
  await readout(page, "Shortest distance", "15 mm");
  await readout(page, "Maximum gap", "15 mm");
  assert.equal(
    await page.getByRole("button", { name: "Move plane Z", exact: true }).isVisible(),
    false,
  );
  // Reverse selection order, then toggle the reference off again.
  await pickTop(page);
  await readout(page, "Area", "400 mm²");
  await plane.click({ modifiers: ["Shift"] });
  await readout(page, "Minimum gap", "15 mm");
  await plane.click({ modifiers: ["Shift"] });
  await readout(page, "Area", "400 mm²");
  await pick(page, [15, 0, 25], true);
  await readout(page, "Shortest distance", "15 mm");
  await plane.click();
  assert.equal((await inspect(page)).modelingSelection.length, 0);
  assert.equal(
    await page.getByRole("button", { name: "Move plane Z", exact: true }).isVisible(),
    true,
  );
}
