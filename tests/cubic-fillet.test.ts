import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle } from "../src/sketch/arc-geometry.js";
import { bezierAt, bezierParameter } from "../src/sketch/bezier-geometry.js";
import type { Curve, Sketch } from "../src/sketch/document.js";
import { createFillet, editFilletRadius, existingFillet } from "../src/sketch/fillet-edit.js";
import { filletCorner } from "../src/sketch/fillet-geometry.js";
import { distance } from "../src/sketch/point-math.js";
import { validateSketch } from "../src/sketch/sketch-validation.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/cubic-corner-fillet.json", "utf8"));
const original: Sketch = fixture.document.sketches[0];

test("captured cubic/line fillet preserves the cubic locus, tangency, links and native Undo", async () => {
  const [, cubic, line] = original.curves;
  assert.ok(cubic.kind === "bezier" && line.kind === "segment");
  const corner = filletCorner(cubic, line, "b", "a");
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    for (const radius of [0.01, 0.5, 2, 5]) {
      const result = createFillet(original, corner, radius, "round");
      validateSketch(result.sketch);
      assert.ok(Math.abs(arcCircle(result.arc).radius - radius) < 1e-7);
      const kept: Curve | undefined = result.sketch.curves.find((c) => c.id === cubic.id);
      assert.ok(kept?.kind === "bezier");
      assert.deepEqual(kept.a, cubic.a);
      const end = bezierParameter(cubic, kept.b);
      for (let i = 0; i <= 10; i++)
        assert.ok(distance(bezierAt(kept, i / 10), bezierAt(cubic, (end * i) / 10)) < 1e-7);
      assert.ok(result.sketch.constraints.some((c) => c.id === original.constraints[0].id));
      assert.equal(result.sketch.constraints.filter((c) => c.kind === "tangent").length, 2);
      const accepted = await owner.call({ kind: "edit", sketch: result.sketch });
      assert.equal(accepted.error, undefined);
      validateSketch(owner.view.data.sketches[0]);
      const nativeCubic = owner.view.data.sketches[0].curves.find((c) => c.id === cubic.id);
      assert.ok(nativeCubic?.kind === "bezier");
      for (let i = 0; i <= 10; i++)
        assert.ok(distance(bezierAt(nativeCubic, i / 10), bezierAt(kept, i / 10)) < 1e-7);
      assert.ok(existingFillet(result.sketch, result.arc));
      for (const nextRadius of [radius / 2, radius * 1.2, 0]) {
        const edited = editFilletRadius(result.sketch, result.arc, nextRadius);
        assert.ok(edited);
        validateSketch(edited);
        assert.equal((await owner.call({ kind: "edit", sketch: edited })).error, undefined);
        await owner.call({ kind: "undo" });
      }
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data.sketches[0], original);
    }
  } finally {
    owner.close();
  }
});

test("cubic fillets handle reversed endpoints and circular supports without flattening", () => {
  const [, source, line] = original.curves;
  assert.ok(source.kind === "bezier" && line.kind === "segment");
  for (const reversed of [false, true]) {
    const cubic = reversed
      ? { ...source, a: source.b, b: source.a, c1: source.c2, c2: source.c1 }
      : source;
    for (const circular of [false, true]) {
      const peer: Curve = circular ? { ...line, kind: "arc", bulge: 0.2 } : line;
      const sketch = { ...original, curves: [cubic, peer], constraints: [] };
      const corner = filletCorner(cubic, peer, reversed ? "a" : "b", "a");
      const result = createFillet(sketch, corner, 1);
      validateSketch(result.sketch);
      assert.ok(Math.abs(arcCircle(result.arc).radius - 1) < 1e-7);
      assert.ok(existingFillet(result.sketch, result.arc));
      const edited = editFilletRadius(result.sketch, result.arc, 0.5);
      assert.ok(edited);
      validateSketch(edited);
    }
  }
});
