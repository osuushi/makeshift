import assert from "node:assert/strict";
import test from "node:test";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import type { ModelView } from "../src/sketch/model-api.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { retainViewSketches } from "../src/sketch/retain-view-sketches.js";

test("solid preview transport preserves unchanged source profile caches but retains genuine edits", () => {
  const sketch = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 20 }).sketch;
  const previous: ModelView = {
    data: { units: "mm", sketches: [sketch] },
    candidate: null,
    canUndo: false,
    canRedo: false,
    solveCount: 0,
    solveMs: 0,
  };
  const profiles = profilesFor(sketch);
  const copied = structuredClone(previous);
  copied.candidate = structuredClone(copied.data);
  const kept = retainViewSketches(previous, copied);
  assert.equal(
    kept.data.sketches,
    previous.data.sketches,
    "Sketch fill and X-ray masks reuse the unchanged collection",
  );
  assert.equal(kept.data.sketches[0], sketch);
  assert.equal(kept.candidate?.sketches[0], sketch);
  assert.equal(profilesFor(kept.data.sketches[0]), profiles);
  assert.notEqual(copied.data.sketches[0], sketch, "Transport input is not mutated");
  const edited = structuredClone(previous);
  edited.data = { ...edited.data, sketches: [{ ...edited.data.sketches[0], plane: planes.XZ }] };
  const changed = retainViewSketches(kept, edited);
  assert.notEqual(changed.data.sketches[0], sketch);
  assert.deepEqual(changed.data, edited.data);
  const candidate = { ...structuredClone(previous.data), sketches: [{ ...sketch, curves: [] }] };
  const preview = retainViewSketches(previous, { ...structuredClone(previous), candidate });
  assert.equal(preview.data.sketches[0], sketch);
  assert.notEqual(preview.candidate?.sketches[0], sketch);
  assert.deepEqual(
    preview.candidate,
    candidate,
    "A sketch edit must not reuse accepted source geometry",
  );
});

test("transport retains identical bodies but never hides mesh or topology metadata changes", async () => {
  const { DocumentOwner } = await import("../src/backend/document-owner.js");
  const { prism, square } = await import("./body-edge-fixtures.js");
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const previous = owner.view;
    const kept = retainViewSketches(previous, structuredClone(previous));
    assert.equal(kept.data.bodies, previous.data.bodies);
    assert.equal(kept.data.bodies?.[0], body);
    for (const edit of [
      (copy: typeof body) => {
        copy.faces[0].vertices[0] += 0.01;
      },
      (copy: typeof body) => {
        copy.faces[0].signature[0] += 1;
      },
    ]) {
      const next = structuredClone(previous);
      const copy = next.data.bodies?.[0];
      assert.ok(copy);
      edit(copy);
      const changed = retainViewSketches(kept, next);
      assert.notEqual(changed.data.bodies?.[0], body);
      assert.deepEqual(changed.data, next.data);
      assert.equal(copy.brep, body.brep, "BRep equality alone cannot justify reuse");
    }
    const removed = retainViewSketches(kept, {
      ...previous,
      data: { ...previous.data, bodies: [] },
    });
    assert.deepEqual(removed.data.bodies, []);
  } finally {
    owner.close();
  }
});
