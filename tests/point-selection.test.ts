import assert from "node:assert/strict";
import test from "node:test";
import { Color } from "three";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle, segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { coloredCurve } from "../src/sketch/point-colors.js";
import { pointHits } from "../src/sketch/point-query.js";
import { colocated, pointBranches } from "../src/sketch/point-selection.js";

test("point branches distinguish rectangle corners, edges and independent endpoints", () => {
  const made = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 10 });
  const line = segment({ x: 0, y: 0 }, { x: -10, y: 0 });
  const sketch = { ...made.sketch, curves: [...made.sketch.curves, line] };
  const hits = pointHits(sketch),
    endpoint = hits.find((h) => h.kind === "endpoint");
  assert.ok(endpoint);
  const peers = colocated(sketch, endpoint);
  assert.equal(peers.length, 2);
  const corner = peers.find((h) => h.kind === "handle");
  assert.ok(corner);
  assert.deepEqual(pointBranches(corner), [
    { curve: made.group.members[0], fraction: 0 },
    { curve: made.group.members[3], fraction: 1 },
  ]);
  assert.deepEqual(pointBranches(endpoint), [{ curve: line.id, fraction: 0 }]);
});
test("point selection fades along edge without coloring the far endpoint", () => {
  const curve = segment({ x: 0, y: 0 }, { x: 100, y: 0 }),
    base = new Color("#283d51");
  const rendered = coloredCurve(curve, 1, base, [{ curve: curve.id, fraction: 0 }], []);
  assert.equal(rendered.colors[0].getHexString(), "155c9e");
  assert.ok(rendered.colors.at(-1)?.equals(base));
  assert.ok(!rendered.colors[4].equals(base));
  const hover = coloredCurve(curve, 1, base, [], [{ curve: curve.id, fraction: 1 }]);
  assert.equal(hover.colors.at(-1)?.getHexString(), "946000");
});
