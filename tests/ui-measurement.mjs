import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { orientWithTurntable } from "./ui-orbit-orient.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function orient(page, normal) {
  await orientWithTurntable(page, normal);
}

export async function readout(page, label, value) {
  await page.waitForFunction(
    ({ label, value }) =>
      [...document.querySelectorAll(".measurement-readout > div")].some(
        (row) =>
          row.firstElementChild?.textContent === label &&
          row.lastElementChild?.textContent === value,
      ),
    { label, value },
  );
}
export async function pick(page, point, shift = false) {
  const p = await project(page, point);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up("Shift");
  return inspect(page);
}
export async function measurementRoute(page, name) {
  await plate(page);
  const original = (await inspect(page)).document;
  const history = await page.evaluate(() => window.makeshiftHistory());
  await readout(page, "Line angle", "90 °");
  await readout(page, "Maximum gap", "20 mm");
  assert.equal(await page.locator(".measurement-witnesses line").count(), 2);
  await clearSelection(page);
  assert.equal(
    await page.getByRole("region", { name: "Measurements", exact: true }).isVisible(),
    false,
  );
  await orient(page, [0.4, -1, 0.7]);
  let state = await pick(page, [-5, -10, 4]);
  assert.equal(state.modelingSelection[0].kind, "face");
  await readout(page, "Area", "200 mm²");
  await orient(page, [0.4, 1, 0.7]);
  state = await pick(page, [4, 10, 4], true);
  assert.equal(state.modelingSelection.length, 2);
  assert.ok(state.modelingSelection.every((t) => t.kind === "face"));
  await readout(page, "Minimum gap", "20 mm");
  await readout(page, "Maximum gap", "20 mm");
  await readout(page, "Relationship", "Parallel");
  const line = await page.locator(".measurement-witnesses line").first().getAttribute("x1");
  await page.mouse.move(1000, 600);
  await page.mouse.wheel(60, 30);
  await inspect(page);
  assert.notEqual(
    await page.locator(".measurement-witnesses line").first().getAttribute("x1"),
    line,
  );
  assert.deepEqual((await inspect(page)).document, original);
  const afterHistory = await page.evaluate(() => window.makeshiftHistory());
  assert.deepEqual(
    afterHistory.filter((entry) => entry.operation.kind !== "selection"),
    history.filter((entry) => entry.operation.kind !== "selection"),
    "readouts and navigation do not add or modify geometry history",
  );
  assert.ok(
    afterHistory
      .filter((entry) => entry.id > history.at(-1).id)
      .every((entry) => entry.operation.kind === "selection"),
    "pointer selection changes retain their ordinary selection history",
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-measurements.png` });
  await (await relativeOffsetInput(page)).fill("1");
  await inspect(page);
  assert.equal(
    await page.getByRole("region", { name: "Measurements", exact: true }).isVisible(),
    false,
  );
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  await inspect(page);
  await readout(page, "Maximum gap", "22 mm");
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await readout(page, "Maximum gap", "20 mm");
  await clearSelection(page);
  await orient(page, [0.4, -1, 0.7]);
  await pick(page, [-5, -10, 4]);
  await orient(page, [0.4, 1, 0.7]);
  state = await pick(page, [-5, 10, 10], true);
  assert.deepEqual(
    state.modelingSelection.map((t) => t.kind),
    ["face", "edge"],
  );
  await readout(page, "Maximum gap", "20 mm");
  await readout(page, "Line–plane angle", "0 °");
  await clearSelection(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).modelingSelection, state.modelingSelection);
  await readout(page, "Maximum gap", "20 mm");
  await chooseTool(page, "redo", "redo");
  assert.equal(
    await page.getByRole("region", { name: "Measurements", exact: true }).isVisible(),
    false,
  );
  assert.deepEqual((await inspect(page)).document, original);
  await sketchMeasurements(page, name);
  console.log(
    `${name}: real face/face, edge/edge, mixed and sketch selection measurements, witness navigation, clear and Undo/Redo passed`,
  );
}

async function sketchMeasurements(page, name) {
  // A fresh sketch proves plane-based line angles and typed edits update the readout.
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-10, -4], [10, -4]);
  await drag(page, [-10, 4], [10, 4]);
  await page.keyboard.press("Escape");
  const a = await at(page, -4, -4),
    b = await at(page, -4, 4);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up("Shift");
  await readout(page, "Maximum gap", "8 mm");
  await readout(page, "Line angle", "0 °");
  const constraints = page.getByRole("group", { name: "Selected entity constraints" });
  const measurements = page.getByRole("region", { name: "Measurements", exact: true });
  const constraintBox = await page.locator('[data-pane="Constraints"]').boundingBox();
  const measurementBox = await page.locator('[data-pane="Measurements"]').boundingBox();
  assert.ok(constraintBox && measurementBox && (await measurements.isVisible()));
  assert.ok(
    measurementBox.y + measurementBox.height <= constraintBox.y ||
      constraintBox.y + constraintBox.height <= measurementBox.y,
    "Docked selection panes occupy separate rows",
  );
  await constraints.getByRole("button", { name: "Constrain parallel", exact: true }).click();
  await inspect(page);
  assert.ok(
    await constraints
      .getByRole("button", { name: "Remove Parallel constraint", exact: true })
      .isVisible(),
  );
  await readout(page, "Maximum gap", "8 mm");
  await page.screenshot({ path: `.cache/sketch-review/${name}-measurement-constraints.png` });
  if (name !== "electron") {
    await page.setViewportSize({ width: 1280, height: 400 });
    const camera = (await inspect(page)).camera;
    const stack = await page.locator("[data-pane=Constraints] .pane-content").boundingBox();
    assert.ok(stack);
    await page.mouse.move(stack.x + stack.width / 2, stack.y + stack.height / 2);
    await page.mouse.wheel(0, 220);
    await page.waitForFunction(
      () => document.querySelector("[data-pane=Constraints] .pane-content").scrollTop > 0,
    );
    assert.deepEqual(
      (await inspect(page)).camera,
      camera,
      "Scrolling the cards does not pan the model",
    );
  }
}
