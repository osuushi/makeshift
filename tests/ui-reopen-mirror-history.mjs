import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { button, completed, field, ready } from "./ui-reopen-cycle.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function mirrorParameterHistory(page, name, sketch) {
  await mirrorSource(page, sketch);
  const source = await inspect(page);
  await chooseTool(page, "mirror", "mirror");
  if (sketch) {
    const axis = await at(page, 0, -20);
    await page.mouse.click(axis.x, axis.y);
  } else await pickPlane(page, "YZ");
  assertMirror(await ready(page, "Accept mirror"), source, sketch, 0);
  await field(page, "Mirror offset").fill("1");
  assertMirror(await ready(page, "Accept mirror"), source, sketch, 1);
  await chooseTool(page, "undo", "undo");
  assert.equal(await field(page, "Mirror offset").inputValue(), "0");
  assertMirror(await ready(page, "Accept mirror"), source, sketch, 0);
  await chooseTool(page, "redo", "redo");
  assert.equal(await field(page, "Mirror offset").inputValue(), "1");
  assertMirror(await ready(page, "Accept mirror"), source, sketch, 1);
  await chooseTool(page, "undo", "undo");
  assertMirror(await ready(page, "Accept mirror"), source, sketch, 0);
  await chooseTool(page, "undo", "undo");
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return !state.busy && state.interaction?.kind === "mirror" && state.preview === null;
  });
  const baseline = await inspect(page);
  assert.deepEqual(baseline.document, source.document);
  assert.deepEqual(baseline.modelingSelection, []);
  assert.deepEqual(baseline.selectionTargets, []);
  assert.equal(await field(page, "Mirror offset").inputValue(), "0");
  assert.equal(await button(page, "Accept mirror").isEnabled(), false);
  await chooseTool(page, "undo", "undo");
  const canceled = await completed(page);
  assert.deepEqual(canceled.document, source.document);
  assert.deepEqual(canceled.modelingSelection, source.modelingSelection);
  assert.deepEqual(canceled.selectionTargets, source.selectionTargets);
  console.log(
    `${name}: ordinary ${sketch ? "sketch" : "body"} Mirror offset Undo/Redo, reference baseline and Undo cancellation preserve exact document/ordered selections`,
  );
}

async function mirrorSource(page, sketch) {
  if (!sketch) {
    await plate(page);
    await button(page, "Select Body 1").click();
    await orient(page, [1, 1, 1]);
    return;
  }
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [5, 3], [15, 9]);
  for (const [label, value] of [
    ["Width", "10"],
    ["Height", "6"],
  ]) {
    await field(page, label).fill(value);
    await page.keyboard.press("Enter");
    await inspect(page);
  }
  const source = await inspect(page);
  assert.equal(source.document.sketches[0].curves.length, 4);
  const group = source.document.sketches[0].groups[0];
  assert.equal(source.document.sketches[0].groups.length, 1);
  assert.deepEqual(source.selectionTargets, [{ kind: "group", group: group.id }]);
  assert.deepEqual(source.selectedCurves, group.members);
  assert.deepEqual(
    group.members,
    source.document.sketches[0].curves.map((curve) => curve.id),
  );
}

function assertMirror(state, source, sketch, offset) {
  assert.deepEqual(state.document, source.document);
  assert.equal(state.interaction.kind, "mirror");
  assert.equal(state.interaction.phase, "editing");
  assert.deepEqual(state.modelingSelection, []);
  assert.deepEqual(state.selectionTargets, []);
  const same = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7);
  if (sketch) {
    const original = source.document.sketches[0].curves;
    const curves = state.preview.sketches[0].curves;
    assert.equal(curves.length, 8);
    assert.deepEqual(curves.slice(0, 4), original);
    for (const [i, curve] of curves.slice(4).entries())
      for (const endpoint of ["a", "b"]) {
        same(curve[endpoint].x, -original[i][endpoint].x - 2 * offset);
        same(curve[endpoint].y, original[i][endpoint].y);
      }
  } else {
    const original = source.document.bodies[0];
    const bodies = state.preview.bodies;
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].id, original.id);
    assert.notEqual(bodies[1].id, original.id);
    same(bodies[1].volume, 4000);
    same(bodies[1].center[0], 2 * offset - original.center[0]);
    bodies[1].bounds.forEach((value, i) => {
      same(
        value,
        i === 0
          ? 2 * offset - original.bounds[3]
          : i === 3
            ? 2 * offset - original.bounds[0]
            : original.bounds[i],
      );
    });
  }
}
