import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { exportMesh } from "../src/model/export-mesh.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { insideBoundary, profileAt, profilesFor } from "../src/sketch/profiles.js";

const captures = ["tangent-circles", "tangent-circles-post"];
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const fixture = (name: string): SketchDocument =>
  JSON.parse(readFileSync(`tests/fixtures/${name}.json`, "utf8")).document;

for (const name of captures) {
  test(`${name}: nested tangent regions partition the whole disk independently of seam and order`, () => {
    const original = fixture(name).sketches[0];
    for (const angle of [0, 0.31, Math.PI / 2, Math.PI, -1.2]) {
      const point = (x: number, y: number) => ({
        x: 30 + x * Math.cos(angle) - y * Math.sin(angle),
        y: -20 + x * Math.sin(angle) + y * Math.cos(angle),
      });
      const curves = original.curves.map((curve) => {
        assert.equal(curve.kind, "circle");
        return { ...curve, center: point(curve.center.x, curve.center.y) };
      });
      for (const ordered of [curves, [...curves].reverse()]) {
        const sketch = { ...original, curves: ordered };
        const profiles = profilesFor(sketch);
        assert.equal(profiles.length, 4);
        near(
          profiles.reduce((area, profile) => area + profile.area, 0),
          144 * Math.PI,
        );
        for (const [x, y, area] of [
          [11, 0, 44],
          [-5, 0, 75],
          [5, 4, 18.75],
          [5, 0, 6.25],
        ]) {
          const p = point(x, y);
          const selected = profileAt(sketch, p);
          assert.ok(selected);
          near(selected.area, area * Math.PI);
          assert.equal(
            profiles.filter(
              (profile) =>
                insideBoundary(profile.outer, p) &&
                !profile.holes.some((hole) => insideBoundary(hole, p)),
            ).length,
            1,
            "Exactly one region contains each probe; selection order cannot hide overlapping fills",
          );
        }
      }
    }
  });
}

for (const [name, x, y, area] of [
  ["tangent-circles", 5, 0, 6.25],
  ["tangent-circles", 5, 4, 18.75],
  ["tangent-circles-post", 5, 4, 18.75],
] as const)
  test(`${name}: selected region at ${x},${y} extrudes with cancel, accept and history`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "open", document: fixture(name) })).error, undefined);
      const before = owner.view.data;
      const sketch = before.sketches[0];
      const selected = profileAt(sketch, { x, y });
      assert.ok(selected);
      const extrusion = {
        sources: [{ sketch: sketch.id, profile: selected.key }],
        distance: 6,
        mode: "auto" as const,
        eligibleTargets: before.bodies?.map((body) => body.id),
      };
      const expected = (before.bodies?.[0].volume ?? 0) + area * Math.PI * 6;
      assert.equal((await owner.call({ kind: "extrude", extrusion })).error, undefined);
      assert.deepEqual(owner.view.data, before);
      near(owner.view.candidate?.bodies?.[0].volume ?? 0, expected);
      await owner.call({ kind: "cancel-preview" });
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "extrude", extrusion })).error, undefined);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const accepted = owner.view.data;
      assert.equal(accepted.bodies?.length, 1);
      const result = accepted.bodies[0];
      near(result.volume, expected);
      try {
        assert.ok(exportMesh(result).triangles.length > 0);
      } catch (error) {
        console.error("tangent-export-body", JSON.stringify(result));
        throw error;
      }
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      near(owner.view.data.bodies?.[0].volume ?? 0, expected);
    } finally {
      owner.close();
    }
  });
