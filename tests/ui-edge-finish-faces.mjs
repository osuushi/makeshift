import assert from "node:assert/strict";
import {
  edgeFinishPrism,
  finishHistory,
  pickWorld,
  sizeInput,
} from "./ui-edge-finish-fixtures.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

function boundarySelection(document, selection) {
  const edges = [];
  for (const target of selection) {
    const body = document.bodies.find((b) => b.id === target.body);
    const ids =
      target.kind === "edge" ? [target.edge] : body.faces.find((f) => f.id === target.face).edges;
    for (const edge of ids)
      if (!edges.some((e) => e.body === target.body && e.edge === edge))
        edges.push({ kind: "edge", body: target.body, edge });
  }
  return edges;
}

async function invokeFaces(page, mode, original, points, keyboard) {
  for (let i = 0; i < points.length; i++) await pickWorld(page, points[i], i > 0);
  const raw = (await inspect(page)).modelingSelection;
  assert.equal(raw.length, points.length);
  assert.equal(raw[0].kind, "face");
  const edges = boundarySelection(original, raw);
  if (keyboard) {
    await page.getByRole("button", { name: "Tools", exact: true }).focus();
    await page.keyboard.press(mode === "fillet" ? "f" : "Shift+F");
  } else await chooseTool(page, mode, mode);
  const state = await inspect(page);
  assert.equal(state.interaction.kind, "body-edge-finish");
  assert.deepEqual(
    state.modelingSelection,
    edges,
    "Ordered boundary conversion deduplicates shared edges",
  );
  assert.deepEqual(state.document, original);
  assert.equal(state.preview, null);
  assert.equal(await sizeInput(page, mode).inputValue(), "0");
  await sizeInput(page, mode).fill("1");
  const preview = await inspect(page);
  assert.ok(preview.preview.bodies[0].volume < original.bodies[0].volume);
  return edges;
}

export async function edgeFinishFacesRoute(page, name) {
  for (const mode of ["fillet", "chamfer"]) {
    const original = await edgeFinishPrism(page);
    await invokeFaces(page, mode, original, [[0, 0, 10]], false);
    await page.screenshot({ path: `.cache/sketch-review/${name}-${mode}-face-boundaries.png` });
    await finishHistory(page, mode, original);
    // The result remains an ordinary body: move it, Undo, then reselect a face.
    await chooseTool(page, "transform", "transform");
    await page.getByRole("button", { name: "Move body X", exact: true }).click();
    await page.locator(".body-transform-value").fill("3");
    await page.keyboard.press("Enter");
    const moved = await inspect(page);
    assert.ok(Math.abs(moved.document.bodies[0].center[0] - 3) < 1e-6);
    await chooseTool(page, "undo", "undo");
    await page.keyboard.press("Escape");
    const state = await pickWorld(page, [0, 0, 10]);
    assert.equal(state.modelingSelection[0]?.kind, "face");

    await edgeFinishPrism(page);
    const adjacent = (await inspect(page)).document;
    const edges = await invokeFaces(
      page,
      mode,
      adjacent,
      [
        [0, 0, 10],
        [10, 0, 5],
      ],
      true,
    );
    assert.equal(edges.length, 7, "Adjacent faces share one boundary edge");
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, adjacent);
    assert.deepEqual((await inspect(page)).modelingSelection, edges);

    await edgeFinishPrism(page);
    const mixed = (await inspect(page)).document;
    const mixedEdges = await invokeFaces(
      page,
      mode,
      mixed,
      [
        [0, 0, 10],
        [10, 10, 5],
      ],
      false,
    );
    assert.equal(mixedEdges.length, 5);
    await page.getByRole("button", { name: `Cancel ${mode}`, exact: true }).click();
    assert.deepEqual((await inspect(page)).document, mixed);
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    assert.equal(
      await toolEnabled(page, mode, mode),
      false,
      "Body tokens do not implicitly select all edges",
    );
  }
  console.log(
    `${name}: face/menu/keyboard boundary conversion, adjacent/mixed dedup, Cancel, move/reselect and one Undo/Redo passed`,
  );
}
