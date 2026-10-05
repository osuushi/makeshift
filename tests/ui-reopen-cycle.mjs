import assert from "node:assert/strict";
import { standaloneOnly } from "./ui-cleanup-controls.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import {
  assertNavigation,
  navigationHistory,
  navigationIdle,
  navigationTips,
} from "./ui-navigation-history.mjs";
import { reopen } from "./ui-reopen-first.mjs";
import { completed, ready } from "./ui-reopen-state.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { assertWidgetTargets } from "./ui-widget-reachability.mjs";
export const field = (page, name) => page.getByRole("textbox", { name, exact: true });
export const button = (page, name) => page.getByRole("button", { name, exact: true });
export { completed, ready } from "./ui-reopen-state.mjs";
export async function acceptedOperation(page, kind) {
  const history = await page.evaluate(() => window.makeshiftHistory());
  const operation = history.findLast(
    (entry) =>
      entry.state === "applied" &&
      entry.outcome === "changed" &&
      !["navigation", "selection"].includes(entry.operation.kind),
  );
  assert.equal(operation?.operation.kind, kind);
  return operation.operation.parameters;
}
export function sameGeometry(preview, accepted) {
  assert.deepEqual(preview.constructionPlanes ?? [], accepted.constructionPlanes ?? []);
  assert.equal(preview.sketches.length, accepted.sketches.length);
  for (const [i, sketch] of accepted.sketches.entries()) {
    assert.deepEqual(preview.sketches[i].plane, sketch.plane);
    const curves = (values) => values.map(({ id, ...geometry }) => geometry);
    assert.deepEqual(curves(preview.sketches[i].curves), curves(sketch.curves));
  }
  assert.equal(preview.bodies?.length ?? 0, accepted.bodies?.length ?? 0);
  for (let i = 0; i < (accepted.bodies?.length ?? 0); i++) {
    assert.ok(Math.abs(preview.bodies[i].volume - accepted.bodies[i].volume) < 1e-4);
    preview.bodies[i].bounds.forEach((value, j) => {
      close(value, accepted.bodies[i].bounds[j], "reopened bounds");
    });
  }
}
/** Ordinary controls prove original Redo survives, then validate the changed candidate and acceptance. */
export async function cycle(
  page,
  {
    before,
    selection,
    sketchSelection,
    parameterPanel,
    navigationBefore,
    kind,
    cancel,
    accept,
    check,
    change,
    validate,
    name,
  },
) {
  const accepted = (await completed(page)).document;
  const parameters = await acceptedOperation(page, kind);
  const acceptedResult = navigationBefore
    ? await undoEntry(page, navigationBefore, accepted, parameters.projection, true)
    : await inspect(page);
  const state = await reopen(page);
  assert.deepEqual(state.document, before);
  assert.ok(state.preview);
  // Erode adds temporary opacity to its retained input; accepted geometry and IDs stay exact.
  const { bodyAppearances: acceptedAppearance, ...acceptedGeometry } = accepted;
  const { bodyAppearances: previewAppearance, ...previewGeometry } = state.preview;
  assert.deepEqual(previewGeometry, acceptedGeometry, "reopening reuses exact accepted geometry");
  if (kind !== "erode") assert.deepEqual(previewAppearance, acceptedAppearance);
  await check(parameters, state, accepted);
  await standaloneOnly(page);
  if (parameterPanel) await assertWidgetTargets(page, parameterPanel, "reopened parameter card");
  await originalRoundTrip(page, {
    before,
    accepted,
    selection,
    sketchSelection,
    result: acceptedResult,
    cancel,
  });
  await reopen(page);
  await change(parameters);
  const candidate = (await ready(page, accept)).preview;
  assert.ok(candidate);
  await validate(candidate, null, parameters, accepted);
  await standaloneOnly(page);
  if (parameterPanel) await assertWidgetTargets(page, parameterPanel, "changed parameter card");
  await page.screenshot({ path: `.cache/sketch-review/${name}-reopen-${kind}.png` });
  const alternativeBeforeEntry = navigationBefore ? await navigationIdle(page) : null;
  if (accept) await button(page, accept).click();
  else {
    await page.locator("#world canvas").focus();
    await page.keyboard.press("Enter");
  }
  const alternative = (await completed(page)).document;
  const alternativeParameters = await acceptedOperation(page, kind);
  const alternativeResult = alternativeBeforeEntry
    ? await undoEntry(
        page,
        alternativeBeforeEntry,
        alternative,
        alternativeParameters.projection,
        false,
      )
    : await inspect(page);
  await validate(alternative, alternativeParameters, parameters, accepted);
  sameGeometry(alternative, candidate);
  await chooseTool(page, "undo", "undo");
  const undone = await completed(page);
  assert.deepEqual(undone.document, before);
  orderedSelection(undone, selection, sketchSelection);
  await chooseTool(page, "redo", "redo");
  const branched = await completed(page);
  assert.deepEqual(branched.document, alternative);
  if (selection || sketchSelection)
    orderedSelection(
      branched,
      alternativeResult.modelingSelection,
      alternativeResult.selectionTargets,
    );
  console.log(
    `${name}: ${kind} restored inputs, changed candidate/accepted geometry, exact Cancel/Redo and branch Undo/Redo passed`,
  );
}

/** Projection completion enters its result workspace as one separately reversible view intent. */
async function undoEntry(page, beforeEntry, geometry, projection, redo) {
  const afterEntry = await navigationIdle(page);
  const tip = await navigationTips(page);
  assert.equal(tip.length, 1, "completion owns exactly one navigation tip");
  assert.equal(tip[0].state, "applied");
  assert.equal(
    afterEntry.activeSketch,
    projection.sketchId,
    "completion enters the recorded destination",
  );
  assert.equal(afterEntry.activePlane, "Projected sketch");
  const target = geometry.sketches.find((sketch) => sketch.id === projection.sketchId);
  assert.ok(target);
  assert.deepEqual(target.plane, projection.frame, "projected workspace uses the recorded frame");
  assert.deepEqual(
    afterEntry.selectionTargets,
    target.curves.map((curve) => ({ kind: "curve", curve: curve.id })),
    "workspace entry selects the projected curves in result order",
  );
  assert.deepEqual(afterEntry.modelingSelection, []);
  const undone = await navigationHistory(page);
  assert.deepEqual(undone.document, geometry, "view Undo leaves accepted geometry exact");
  console.log(
    "projection-navigation-trace",
    JSON.stringify({
      beforeEntry: navigationState(beforeEntry),
      afterEntry: navigationState(afterEntry),
      undone: navigationState(undone),
    }),
  );
  assertNavigation(undone, beforeEntry, "completion view Undo");
  assert.equal((await navigationTips(page))[0].state, "undone");
  if (redo) {
    const redone = await navigationHistory(page, true);
    assert.deepEqual(redone.document, geometry, "view Redo leaves accepted geometry exact");
    assertNavigation(redone, afterEntry, "completion view Redo");
  }
  return undone;
}

function orderedSelection(state, modeling, sketch) {
  if (modeling) assert.deepEqual(state.modelingSelection, modeling, "ordered model selection");
  if (sketch) assert.deepEqual(state.selectionTargets, sketch, "ordered sketch selection");
}

/** Cancel and baseline Undo both retain the exact original geometry Redo and its ordered result selection. */
async function originalRoundTrip(
  page,
  { before, accepted, selection, sketchSelection, result, cancel },
) {
  if (cancel) await button(page, cancel).click();
  else await page.keyboard.press("Escape");
  const canceled = await completed(page);
  assert.deepEqual(canceled.document, before);
  orderedSelection(canceled, selection, sketchSelection);
  await chooseTool(page, "redo", "redo");
  const redone = await completed(page);
  assert.deepEqual(redone.document, accepted);
  if (selection || sketchSelection) {
    orderedSelection(redone, result.modelingSelection, result.selectionTargets);
    await reopen(page);
    await chooseTool(page, "undo", "undo");
    const baseline = await completed(page);
    assert.deepEqual(baseline.document, before);
    orderedSelection(baseline, selection, sketchSelection);
    await chooseTool(page, "redo", "redo");
    const restored = await completed(page);
    assert.deepEqual(restored.document, accepted);
    orderedSelection(restored, result.modelingSelection, result.selectionTargets);
  }
}

function navigationState(state) {
  const { position, target, up, height } = state.camera;
  return {
    camera: { position, target, up, height },
    workspace: {
      key: state.activePlane,
      sketchId: state.activeSketch,
      frame:
        state.document.sketches.find((sketch) => sketch.id === state.activeSketch)?.plane ?? null,
    },
    modeling: state.modelingSelection,
    sketch: state.selectionTargets,
  };
}
