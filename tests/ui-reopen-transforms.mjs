import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { button, completed, cycle, field, ready } from "./ui-reopen-cycle.mjs";
import { reopen } from "./ui-reopen-first.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function preciseRectangle(page, a = [5, 3], b = [15, 9]) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, a, b);
  for (const [label, value] of [
    ["Width", b[0] - a[0]],
    ["Height", b[1] - a[1]],
  ]) {
    await field(page, label).fill(String(value));
    await page.keyboard.press("Enter");
    await inspect(page);
  }
  return (await inspect(page)).document;
}
export async function reopenScale(page, name) {
  await preciseRectangle(page);
  const source = await inspect(page),
    before = source.document;
  await chooseTool(page, "transform", "transform");
  const handle = page.locator('.transform-box-handle[data-handle="-1,-1,0"]');
  const box = await handle.boundingBox();
  assert.ok(box);
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await ready(page, "Accept transform scale");
  await button(page, "Accept transform scale").click();
  const curves = before.sketches[0].curves;
  const points = curves.flatMap((curve) => [curve.a, curve.b]);
  const pivot = [Math.max(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y)), 0];
  await cycle(page, {
    before,
    kind: "scale",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    cancel: "Cancel transform scale",
    accept: "Accept transform scale",
    name,
    check: async ({ operation }) => {
      assert.equal(operation.kind, "curves");
      assert.deepEqual(
        operation.ids,
        curves.map((curve) => curve.id),
      );
      assert.equal(operation.sketchId, before.sketches[0].id);
      assert.deepEqual(operation.pivot, pivot, "pointer gesture records opposite corner pivot");
      assert.ok(operation.factors[0] > 1);
      assert.equal(
        await field(page, "Transform scale X").inputValue(),
        String(operation.factors[0]),
      );
    },
    change: () => field(page, "Transform scale X").fill("3"),
    validate: async (geometry, parameters, original) => {
      for (const [i, curve] of geometry.sketches[0].curves.entries())
        for (const endpoint of ["a", "b"])
          for (const [axis, index] of [
            ["x", 0],
            ["y", 1],
          ])
            close(
              curve[endpoint][axis],
              pivot[index] +
                (index ? original.operation.factors[1] : 3) *
                  (curves[i][endpoint][axis] - pivot[index]),
              "recorded pivot remains fixed on numeric change",
            );
      if (parameters) {
        assert.deepEqual(parameters.operation.pivot, pivot);
        assert.deepEqual(parameters.operation.ids, original.operation.ids);
        assert.deepEqual(parameters.operation.factors, [3, original.operation.factors[1], 1]);
      }
    },
  });
}
export async function reopenBodyMove(page, name) {
  await plate(page);
  await button(page, "Select Body 1").click();
  const source = await inspect(page),
    before = source.document;
  await chooseTool(page, "transform", "transform");
  await button(page, "Move body X").click();
  await field(page, "Body translation X").fill("3");
  await page.keyboard.press("Enter");
  await cycle(page, {
    before,
    kind: "transform-bodies",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    name,
    check: async ({ transform }) => {
      assert.deepEqual(transform.ids, [before.bodies[0].id]);
      assert.deepEqual(transform.translation, [3, 0, 0]);
      assert.deepEqual(transform.axis, [1, 0, 0]);
      const bounds = before.bodies[0].bounds;
      assert.deepEqual(
        transform.pivot,
        [0, 1, 2].map((i) => (bounds[i] + bounds[i + 3]) / 2),
        "ordinary body pivot is the bounds midpoint, distinct from native centroid roundoff",
      );
      assert.equal(transform.angle, 0);
      assert.equal(transform.duplicate, false);
      assert.equal(await field(page, "Body translation X").inputValue(), "3");
    },
    change: () => field(page, "Body translation X").fill("1.5"),
    validate: async (geometry, parameters, original) => {
      close(geometry.bodies[0].center[0], before.bodies[0].center[0] + 1.5);
      close(geometry.bodies[0].volume, before.bodies[0].volume);
      for (let i = 0; i < 6; i++)
        close(geometry.bodies[0].bounds[i], before.bodies[0].bounds[i] + (i % 3 === 0 ? 1.5 : 0));
      if (parameters)
        assert.deepEqual(parameters.transform, { ...original.transform, translation: [1.5, 0, 0] });
    },
  });
}
export async function reopenMirror(page, name, sketch = false) {
  if (sketch) await preciseRectangle(page);
  else {
    await plate(page);
    await button(page, "Select Body 1").click();
    await orient(page, [1, 1, 1]);
  }
  const source = await inspect(page),
    before = source.document;
  await chooseTool(page, "mirror", "mirror");
  if (sketch) {
    const axis = await at(page, 0, -20);
    await page.mouse.click(axis.x, axis.y);
  } else await pickPlane(page, "YZ");
  await ready(page, "Accept mirror");
  await button(page, "Accept mirror").click();
  await cycle(page, {
    before,
    kind: "mirror",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    name: `${name}-${sketch ? "sketch" : "body"}`,
    cancel: "Cancel mirror",
    accept: "Accept mirror",
    check: async ({ operation }) => {
      assert.equal(operation.kind, sketch ? "sketch" : "bodies");
      assert.equal(operation.keepOriginal, true);
      assert.deepEqual(
        operation.ids,
        sketch ? before.sketches[0].curves.map((curve) => curve.id) : [before.bodies[0].id],
      );
      assert.equal(
        await field(page, "Mirror offset").inputValue(),
        "0",
        "recorded final reference has canonical extra offset zero",
      );
    },
    change: async () => {
      await page.getByRole("checkbox", { name: "Keep original", exact: true }).uncheck();
      await field(page, "Mirror offset").fill("1");
    },
    validate: async (geometry, parameters, original) => {
      if (sketch) {
        const line = original.operation.line,
          length = Math.hypot(line.direction.x, line.direction.y);
        const normal = { x: -line.direction.y / length, y: line.direction.x / length };
        for (const [i, curve] of geometry.sketches[0].curves.entries())
          for (const endpoint of ["a", "b"]) {
            const point = before.sketches[0].curves[i][endpoint];
            const distance =
              (point.x - line.origin.x - normal.x) * normal.x +
              (point.y - line.origin.y - normal.y) * normal.y;
            close(curve[endpoint].x, point.x - 2 * distance * normal.x);
            close(curve[endpoint].y, point.y - 2 * distance * normal.y);
          }
      } else {
        assert.equal(geometry.bodies.length, 1);
        close(geometry.bodies[0].center[0], 2 - before.bodies[0].center[0]);
        close(geometry.bodies[0].volume, before.bodies[0].volume);
      }
      if (parameters) {
        assert.equal(parameters.operation.keepOriginal, false);
        assert.deepEqual(parameters.operation.ids, original.operation.ids);
        if (!sketch)
          assert.deepEqual(parameters.operation.plane, {
            ...original.operation.plane,
            origin: [1, 0, 0],
          });
      }
    },
  });
}
export async function reopenPlane(page, name) {
  const { center } = await plate(page);
  await page.mouse.click(center.x + 30, center.y + 30);
  const source = await inspect(page);
  await chooseTool(page, "construction plane", "construction-plane");
  await completed(page);
  await planeCycle(page, source, `${name}-created`, "X", 3);
  await button(page, "Select Plane 1").first().click();
  const existing = await inspect(page);
  await chooseTool(page, "transform", "transform");
  await orient(page, [1, 1, 1]);
  await button(page, "Move plane Z").click();
  await field(page, "Plane translation Z").fill("2");
  await page.keyboard.press("Enter");
  await planeCycle(page, existing, `${name}-existing`, "X", 1);
}
async function planeCycle(page, source, name, axis, value) {
  const before = source.document;
  const accepted = (await completed(page)).document;
  await reopen(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(
    (await completed(page)).document,
    before,
    "unmodified restored plane baseline Undo exits the modal",
  );
  await chooseTool(page, "redo", "redo");
  assert.deepEqual(
    (await completed(page)).document,
    accepted,
    "plane local-baseline Undo retains original Redo",
  );
  await cycle(page, {
    before,
    kind: "construction-plane",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    name,
    check: async ({ plane }, state, accepted) => {
      assert.deepEqual(plane, accepted.constructionPlanes[0]);
      assert.deepEqual(state.preview.constructionPlanes[0], plane);
      assert.match(await page.getByRole("status").textContent(), /Recorded frame restored/);
    },
    change: async () => {
      await button(page, `Move plane ${axis}`).click();
      await field(page, `Plane translation ${axis}`).fill(String(value));
    },
    validate: async (geometry, parameters, original) => {
      const expected = structuredClone(original.plane);
      expected.frame.origin["XYZ".indexOf(axis)] += value;
      assert.deepEqual(geometry.constructionPlanes[0], expected);
      if (parameters) assert.deepEqual(parameters.plane, expected);
    },
  });
}
