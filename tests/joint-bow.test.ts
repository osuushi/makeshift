import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle, bowRadius } from "../src/sketch/arc-geometry.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { jointBow } from "../src/sketch/joint-bow.js";
import { planes } from "../src/sketch/planes.js";

test("joint bow casts rectangle sides to separate equal-radius arcs with fixed endpoints and one Undo", async () => {
  const { sketch } = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 20, y: 10 });
  const sources = sketch.curves.filter((c) => c.kind === "segment");
  const changed = jointBow(sketch, sources, bowRadius(sources[0], 15, 1));
  assert.equal(changed.groups.length, 0);
  assert.equal(changed.constraints.filter((c) => c.kind === "coincident").length, 4);
  assert.throws(
    () => jointBow(sketch, sources, bowRadius(sources[1], 6, 1)),
    /Radius magnitude must be at least/,
  );
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const before = owner.view.data;
    assert.equal((await owner.call({ kind: "edit", sketch: changed })).error, undefined);
    for (const [i, c] of owner.view.data.sketches[0].curves.entries()) {
      assert.ok(c.kind === "arc");
      assert.deepEqual(c.a, sources[i].a);
      assert.deepEqual(c.b, sources[i].b);
      assert.ok(Math.abs(arcCircle(c).radius - 15) < 1e-7);
    }
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
