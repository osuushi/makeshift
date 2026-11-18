import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { orient, pick, readout } from "./ui-measurement.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function above(page) {
  await orient(page, [0, -1, 0.3]);
  await orient(page, [0, -0.3, 1]);
}
async function below(page) {
  await orient(page, [0, -1, 0.3]);
  await orient(page, [0, -0.3, -1]);
}
export async function regionMeasurementRoute(page, name) {
  await plate(page);
  await clearSelection(page);
  const original = (await inspect(page)).document;
  const history = await page.evaluate(() => window.makeshiftHistory());
  await below(page);
  let state = await pick(page, [5, 5, 0]);
  assert.equal(state.modelingSelection[0]?.kind, "profile");
  await readout(page, "Area", "400 mm²");
  await above(page);
  state = await pick(page, [5, 5, 10], true);
  assert.deepEqual(
    state.modelingSelection.map((t) => t.kind),
    ["profile", "face"],
  );
  await readout(page, "Minimum gap", "10 mm");
  await readout(page, "Maximum gap", "10 mm");
  assert.deepEqual(state.document, original);
  assert.deepEqual(await page.evaluate(() => window.makeshiftHistory()), history);
  await clearSelection(page);
  await pick(page, [5, 5, 10]);
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).activePlane);
  await page.keyboard.press("r");
  await drag(page, [-4, -4], [4, 4]);
  state = await inspect(page);
  const plane = state.document.sketches.at(-1).plane;
  await chooseTool(page, "return to modeling", "modeling");
  state = await pick(page, plane.origin);
  assert.equal(state.modelingSelection[0]?.kind, "profile");
  await readout(page, "Area", "64 mm²");
  await below(page);
  state = await pick(page, [5, 5, 0], true);
  assert.deepEqual(
    state.modelingSelection.map((t) => t.kind),
    ["profile", "profile"],
  );
  await readout(page, "Maximum gap", "10 mm");
  assert.equal(state.document.bodies.length, 1);
  await chooseTool(page, "hide bodies", "hide-bodies");
  await above(page);
  await pick(page, plane.origin);
  await pick(page, [5, 5, 0], true);
  await readout(page, "Maximum gap", "10 mm");
  await page.screenshot({ path: `.cache/sketch-review/${name}-measurement-regions.png` });
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await readout(page, "Area", "400 mm²");
  assert.equal(
    await page
      .getByRole("region", { name: "Measurements", exact: true })
      .getByText("Maximum gap", { exact: true })
      .count(),
    0,
  );
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await clearSelection(page);
  await pick(page, plane.origin);
  await readout(page, "Area", "64 mm²");
  console.log(
    `${name}: filled region/face and region/region measurements, hidden bodies and Undo/Redo passed`,
  );
}
