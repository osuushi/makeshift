import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { navigationIdle } from "./ui-navigation-history.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { button, completed, cycle, field, ready, sameGeometry } from "./ui-reopen-cycle.mjs";
import { splitPlate } from "./ui-reopen-solids.mjs";
import { preciseRectangle } from "./ui-reopen-transforms.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function reopenCut(page, name, imprint = false) {
  const { center } = await plate(page);
  if (imprint) await page.mouse.click(center.x + 30, center.y + 30);
  else await button(page, "Select Body 1").click();
  const source = await inspect(page),
    selected = source.modelingSelection;
  await orient(page, [1, -1, 1]);
  const before = (await inspect(page)).document;
  await chooseTool(page, imprint ? "Imprint" : "Split Body", imprint ? "imprint" : "split");
  await pickPlane(page, "YZ");
  assert.equal((await inspect(page)).preview.bodies.length, imprint ? 1 : 2);
  await page.locator("#world canvas").focus();
  await page.keyboard.press("Enter");
  await cycle(page, {
    before,
    kind: "plane-cut",
    selection: selected,
    sketchSelection: source.selectionTargets,
    name: `${name}-${imprint ? "imprint" : "split"}`,
    check: async ({ operation }) => {
      assert.equal(operation.mode, imprint ? "imprint" : "split");
      assert.deepEqual(operation.targets, [
        { body: before.bodies[0].id, ...(imprint ? { faces: [selected[0].face] } : {}) },
      ]);
      assert.deepEqual(operation.frame, { origin: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1] });
    },
    change: () => pickPlane(page, "XZ"),
    validate: async (geometry, parameters, original) => {
      if (imprint) {
        assert.equal(geometry.bodies.length, 1);
        close(geometry.bodies[0].volume, 4000);
        const faces = geometry.bodies[0].faces.filter((face) =>
          face.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
        );
        assert.equal(faces.length, 2, "native top support is split into two faces");
        const ranges = faces
          .map((face) => {
            const y = face.vertices.filter((_, i) => i % 3 === 1);
            return [Math.min(...y), Math.max(...y)];
          })
          .toSorted((a, b) => a[0] - b[0]);
        for (const [i, endpoints] of [
          [-10, 0],
          [0, 10],
        ].entries())
          for (const [j, endpoint] of endpoints.entries())
            close(ranges[i][j], endpoint, "native imprint Y partition endpoint");
      } else {
        assert.equal(geometry.bodies.length, 2);
        const halves = geometry.bodies.toSorted((a, b) => a.center[1] - b.center[1]);
        close(halves[0].volume, 2000);
        close(halves[1].volume, 2000);
        close(halves[0].center[1], -5);
        close(halves[1].center[1], 5);
        for (const body of halves) close(body.center[0], 0);
      }
      if (parameters)
        assert.deepEqual(parameters.operation, {
          ...original.operation,
          frame: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] },
        });
    },
  });
}
export async function reopenProjection(page, name) {
  await preciseRectangle(page, [-10, -5], [10, 5]);
  await chooseTool(page, "return to modeling", "modeling");
  await button(page, "Select Sketch 1").click();
  await orient(page, [1, 1, 1]);
  await chooseTool(page, "transform", "transform");
  await button(page, "Rotate sketch X").click();
  await field(page, "Rotation X").fill("45");
  await page.keyboard.press("Enter");
  await completed(page);
  await page.keyboard.press("Escape");
  await button(page, "Select Sketch 1").click();
  const source = await inspect(page),
    before = source.document;
  await chooseTool(page, "project", "project");
  await pickPlane(page, "XY");
  await ready(page, "Accept projection");
  const navigationBefore = await navigationIdle(page);
  await button(page, "Accept projection").click();
  await cycle(page, {
    before,
    kind: "project",
    navigationBefore,
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    name,
    cancel: "Cancel projection",
    accept: "Accept projection",
    check: async ({ projection }, state, accepted) => {
      assert.deepEqual(projection.sources, [{ kind: "sketch", sketch: before.sketches[0].id }]);
      assert.equal(projection.direction, "target-normal");
      assert.deepEqual(projection.frame, { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] });
      assert.equal(projection.sketchId, accepted.sketches[1].id);
      assert.equal(state.preview.sketches[1].id, projection.sketchId);
      await projectionParameterHistory(page, before, accepted);
    },
    change: () => button(page, "Project along source normal").click(),
    validate: async (geometry, parameters, original) => {
      const target = geometry.sketches.find((sketch) => sketch.id === original.projection.sketchId);
      assert.ok(target);
      const points = target.curves.flatMap((curve) => {
        assert.equal(curve.kind, "segment");
        return [curve.a, curve.b];
      });
      close(Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)), 20);
      close(
        Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
        10 * Math.SQRT2,
        "source-normal projection span",
      );
      if (parameters)
        assert.deepEqual(parameters.projection, {
          ...original.projection,
          direction: "source-normal",
        });
    },
  });
}

/** Reopened sources and cast direction stay within the ordinary modal checkpoints. */
async function projectionParameterHistory(page, before, accepted) {
  await button(page, "Select Sketch 1").click();
  const empty = async () => {
    await page.waitForFunction(
      () => !window.makeshiftInspect().busy && !window.makeshiftInspect().preview,
    );
    assert.equal(await button(page, "Accept projection").isDisabled(), true);
    assert.deepEqual((await inspect(page)).document, before);
    assert.deepEqual((await inspect(page)).modelingSelection, []);
  };
  await empty();
  await chooseTool(page, "undo", "undo");
  let restored = await ready(page, "Accept projection");
  sameGeometry(restored.preview, accepted);
  assert.deepEqual(restored.modelingSelection, [{ kind: "sketch", sketch: before.sketches[0].id }]);
  await chooseTool(page, "redo", "redo");
  await empty();
  await chooseTool(page, "undo", "undo");
  sameGeometry((await ready(page, "Accept projection")).preview, accepted);
  await button(page, "Project along source normal").click();
  await ready(page, "Accept projection");
  await chooseTool(page, "undo", "undo");
  sameGeometry((await ready(page, "Accept projection")).preview, accepted);
  assert.equal(
    await button(page, "Project along target normal").getAttribute("aria-pressed"),
    "true",
  );
  await chooseTool(page, "redo", "redo");
  restored = await ready(page, "Accept projection");
  const points = restored.preview.sketches[1].curves.flatMap((curve) => [curve.a, curve.b]);
  close(
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
    10 * Math.SQRT2,
    "local direction Redo regenerates source-normal native span",
  );
  assert.equal(
    await button(page, "Project along source normal").getAttribute("aria-pressed"),
    "true",
  );
  await chooseTool(page, "undo", "undo");
  sameGeometry((await ready(page, "Accept projection")).preview, accepted);
}

export async function reopenCleanup(page, name) {
  await splitPlate(page);
  await button(page, "Select Body 1").click();
  const source = await inspect(page),
    before = source.document;
  await chooseTool(page, "clean up", "cleanup");
  await ready(page, "Accept cleanup");
  assert.ok((await inspect(page)).preview.bodies[0].faces.length < before.bodies[0].faces.length);
  await button(page, "Accept cleanup").click();
  await cycle(page, {
    before,
    kind: "cleanup",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    cancel: "Cancel cleanup",
    accept: "Accept cleanup",
    name,
    check: async ({ selection }) =>
      assert.deepEqual(selection, [
        { body: before.bodies[0].id, whole: true, faces: [], edges: [] },
      ]),
    change: async () => {},
    validate: async (geometry, parameters, original) => {
      close(geometry.bodies[0].volume, before.bodies[0].volume);
      assert.ok(geometry.bodies[0].faces.length < before.bodies[0].faces.length);
      if (parameters) assert.deepEqual(parameters.selection, original.selection);
    },
  });
}
