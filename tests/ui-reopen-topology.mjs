import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { prepareShoulder } from "./ui-edge-move.mjs";
import { makeFeature, pickFeatureFace } from "./ui-face-move-fixtures.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { button, completed, cycle, field, ready, sameGeometry } from "./ui-reopen-cycle.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { assertWidgetTargets } from "./ui-widget-reachability.mjs";

async function reachableDisclosure(page, name) {
  const viewport = page.viewportSize();
  const before = (await inspect(page)).document;
  await page.setViewportSize({ width: 390, height: 600 });
  await page.mouse.move(180, 320);
  await page.mouse.wheel(200, 90);
  await inspect(page);
  await assertWidgetTargets(page, ".current-transform:not([hidden])", "Restored transform card");
  const layout = await page.locator(".current-transform:visible").evaluate((root) => {
    const r = root.getBoundingClientRect();
    return {
      bounds: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      fit: root.dataset.widgetFit,
      scrolling: { height: root.scrollHeight, client: root.clientHeight, top: root.scrollTop },
      inputs: Array.from(root.querySelectorAll("input")).map((input) => {
        const b = input.getBoundingClientRect();
        return {
          name: input.getAttribute("aria-label"),
          bounds: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
          hit: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.tagName,
        };
      }),
      hits: Array.from(root.querySelectorAll("input"))
        .filter((input) => !input.closest("[hidden]"))
        .every((input) => {
          const b = input.getBoundingClientRect();
          return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === input;
        }),
    };
  });
  assert.ok(
    layout.bounds.left >= 8 &&
      layout.bounds.right <= layout.viewport.width - 8 &&
      layout.bounds.top >= 8 &&
      layout.bounds.bottom <= layout.viewport.height - 8 &&
      layout.fit === "clear" &&
      layout.hits,
    `moved projected anchor keeps cumulative fields reachable: ${JSON.stringify(layout)}`,
  );
  assert.deepEqual((await inspect(page)).document, before);
  await page.screenshot({ path: `.cache/sketch-review/${name}-reopen-topology-narrow.png` });
  await page.mouse.wheel(-200, -90);
  await inspect(page);
  await page.setViewportSize(viewport);
}
async function invalidCurrent(page, label, accept, before, original, recovery) {
  const input = field(page, label);
  const preview = (await inspect(page)).preview;
  for (const value of ["", "Infinity"]) {
    await input.fill(value);
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal(await button(page, accept).isDisabled(), true);
    assert.deepEqual((await inspect(page)).document, before);
  }
  await input.fill(String(recovery));
  await ready(page, accept);
  assert.equal(await input.getAttribute("aria-invalid"), "false");
  await input.press("Tab");
  await input.fill("Infinity");
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  await chooseTool(page, "undo", "undo");
  const restored = await ready(page, accept);
  assert.deepEqual(restored.document, before);
  close(Number(await input.inputValue()), original);
  assert.equal(await page.locator('.current-transform input[aria-invalid="true"]').count(), 0);
  sameGeometry(restored.preview, preview);
}

/** Verify the restored face fields, moved anchor and invalid-to-valid local history before ordinary reentry. */
async function faceCurrentEntry(page, name, before, operation) {
  close(Number(await field(page, "Cumulative face angle").inputValue()), operation.angle);
  for (const [i, axis] of [..."XYZ"].entries())
    close(
      Number(await field(page, `Cumulative translation ${axis}`).inputValue()),
      operation.translation[i],
    );
  await reachableDisclosure(page, name);
  await invalidCurrent(
    page,
    "Cumulative translation X",
    "Accept face movement",
    before,
    operation.translation[0],
    1.25,
  );
  assert.deepEqual((await inspect(page)).document, before);
  assert.equal(await page.locator('.current-transform input[aria-invalid="true"]').count(), 0);
}

/** Independently verify the accepted profile in world coordinates before moving its native cap. */
function faceSourceCap(body, faces, sketch) {
  const points = sketch.curves.flatMap((curve) => {
    assert.equal(curve.kind, "segment");
    return [curve.a, curve.b].map((point) =>
      sketch.plane.origin.map(
        (value, i) => value + point.x * sketch.plane.u[i] + point.y * sketch.plane.v[i],
      ),
    );
  });
  const bounds = [0, 1, 2].map((axis) => {
    const values = points.map((point) => point[axis]);
    return [Math.min(...values), Math.max(...values)];
  });
  close(bounds[0][1] - bounds[0][0], 4, "independent world profile width");
  close(bounds[1][1] - bounds[1][0], 6, "independent world profile height");
  for (const point of points) close(point[2], 5, "independent profile support");
  close(body.volume, 20 * 20 * 5 + 4 * 6 * 6, "independent stock and shoulder volume");
  const cap = faces.find((face) =>
    face.vertices.every((value, i) => i % 3 !== 2 || Math.abs(value - 11) < 1e-6),
  );
  assert.ok(cap);
  assert.ok(body.faces.some((face) => face.id === cap.id));
  for (const axis of [0, 1, 2]) {
    const values = cap.vertices.filter((_, i) => i % 3 === axis);
    const swept = bounds[axis].map((value) => value + (axis === 2 ? 6 : 0));
    close(Math.min(...values), swept[0], "native cap matches profile sweep minimum");
    close(Math.max(...values), swept[1], "native cap matches profile sweep maximum");
  }
  return { cap, pivot: [(bounds[0][0] + bounds[0][1]) / 2, (bounds[1][0] + bounds[1][1]) / 2, 8] };
}

/** Independently rotate exact input vertices, then compare native candidate and accepted bounds. */
function faceCandidate(geometry, parameters, original, body, source) {
  close(geometry.bodies[0].volume, body.volume);
  const cap = geometry.bodies[0].faces.find((face) => face.id === source.id);
  assert.ok(cap, "movement preserves the exact original cap ID");
  const { pivot } = original.operation;
  const angle = Math.PI / 18,
    y = original.operation.translation[1],
    expected = [];
  for (let i = 0; i < source.vertices.length; i += 3) {
    const x = source.vertices[i] - pivot[0],
      dy = source.vertices[i + 1] - pivot[1];
    expected.push(
      pivot[0] + x * Math.cos(angle) - dy * Math.sin(angle) + 1.5,
      pivot[1] + x * Math.sin(angle) + dy * Math.cos(angle) + y,
      source.vertices[i + 2],
    );
  }
  for (const axis of [0, 1, 2]) {
    const actual = cap.vertices.filter((_, i) => i % 3 === axis);
    const values = expected.filter((_, i) => i % 3 === axis);
    close(Math.min(...actual), Math.min(...values), "independent moved cap minimum");
    close(Math.max(...actual), Math.max(...values), "independent moved cap maximum");
  }
  if (parameters) {
    assert.deepEqual(parameters.operation.faces, original.operation.faces);
    assert.deepEqual(parameters.operation.pivot, pivot);
    assert.deepEqual(parameters.operation.axis, original.operation.axis);
    close(parameters.operation.angle, 10);
    close(parameters.operation.translation[0], 1.5);
    close(parameters.operation.translation[1], y);
    close(parameters.operation.translation[2], 0);
  }
}

export async function reopenFaceMove(page, name) {
  const { body, faces } = await makeFeature(page, false, 4, false, true);
  const seed = (await completed(page)).document;
  const { cap, pivot } = faceSourceCap(body, faces, seed.sketches[1]);
  for (let i = 0; i < faces.length; i++) await pickFeatureFace(page, faces[i], i > 0);
  const source = await inspect(page),
    before = source.document;
  const selected = source.modelingSelection;
  await chooseTool(page, "transform", "transform");
  await button(page, "Move faces X").click();
  await field(page, "Face translation X").fill("2");
  await ready(page, "Accept face movement");
  await orient(page, [0.5, 0.5, 1]);
  await button(page, "Rotate faces Z").click();
  await field(page, "Face rotation Z").fill("15");
  await ready(page, "Accept face movement");
  await button(page, "Accept face movement").click();
  await cycle(page, {
    before,
    kind: "move-faces",
    selection: selected,
    sketchSelection: source.selectionTargets,
    cancel: "Cancel face movement",
    accept: "Accept face movement",
    name,
    check: async ({ operation }) => {
      assert.deepEqual(
        operation.faces,
        selected.map(({ body, face }) => ({ body, face })),
      );
      close(operation.angle, 15);
      for (const [axis, value] of operation.pivot.entries())
        close(value, pivot[axis], "independent input pivot");
      assert.deepEqual(operation.axis, [0, 0, 1]);
      close(operation.translation[0], 2 * Math.cos(Math.PI / 12));
      close(operation.translation[1], 2 * Math.sin(Math.PI / 12));
      await faceCurrentEntry(page, name, before, operation);
    },
    change: async () => {
      assert.equal(await page.locator('.current-transform input[aria-invalid="true"]').count(), 0);
      await field(page, "Cumulative translation X").fill("1.25");
      await ready(page, "Accept face movement");
      await field(page, "Cumulative face angle").fill("10");
      await ready(page, "Accept face movement");
      await button(page, "Move faces X").click();
      await field(page, "Face translation X").fill("0.25");
    },
    validate: async (geometry, parameters, original) =>
      faceCandidate(geometry, parameters, original, body, cap),
  });
}
export async function reopenEdgeMove(page, name) {
  const before = await prepareShoulder(page, name, false);
  await completed(page);
  const source = await inspect(page),
    selection = source.modelingSelection;
  assert.equal(selection.length, 1);
  const target = selection[0],
    edge = before.bodies[0].edges.find((edge) => edge.id === target.edge);
  await chooseTool(page, "transform", "transform");
  await button(page, "Move edges Z").click();
  await field(page, "Edge translation Z").fill("1");
  await ready(page, "Accept edge movement");
  await button(page, "Accept edge movement").click();
  await cycle(page, {
    before,
    kind: "move-edges",
    selection,
    sketchSelection: source.selectionTargets,
    cancel: "Cancel edge movement",
    accept: "Accept edge movement",
    name,
    check: async ({ operation }) => {
      assert.deepEqual(operation.edges, [{ body: target.body, edge: target.edge }]);
      assert.deepEqual(operation.translation, [0, 0, 1]);
      assert.equal(await field(page, "Cumulative translation Z").inputValue(), "1");
      const angle = page.locator(".current-transform:visible").getByRole("textbox", {
        name: "Cumulative face angle",
        exact: true,
        includeHidden: true,
      });
      assert.equal(await angle.count(), 1);
      assert.equal(await angle.isVisible(), false);
      await invalidCurrent(
        page,
        "Cumulative translation Z",
        "Accept edge movement",
        before,
        1,
        0.5,
      );
      assert.equal(await angle.getAttribute("aria-invalid"), null);
    },
    change: async () => {
      assert.equal(await page.locator('.current-transform input[aria-invalid="true"]').count(), 0);
      await field(page, "Cumulative translation Z").fill("0.5");
      await ready(page, "Accept edge movement");
      await button(page, "Move edges Z").click();
      await field(page, "Edge translation Z").fill("0.25");
    },
    validate: async (geometry, parameters, original) => {
      const moved = geometry.bodies[0].edges.find((candidate) => candidate.id === target.edge);
      assert.ok(moved);
      const heights = moved.points.filter((_, i) => i % 3 === 2),
        source = edge.points.filter((_, i) => i % 3 === 2);
      close(Math.min(...heights), Math.min(...source) + 0.75);
      close(Math.max(...heights), Math.max(...source) + 0.75);
      if (parameters)
        assert.deepEqual(parameters.operation, {
          ...original.operation,
          translation: [0, 0, 0.75],
        });
    },
  });
}
