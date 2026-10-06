import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
for (const { distance, hollow } of [
  { distance: 12, hollow: false },
  { distance: -3, hollow: false },
  { distance: 3, hollow: true },
  { distance: -3, hollow: true },
]) {
  test(`normal extrusion creates a bounded cylinder shoulder at ${distance} mm (${hollow ? "hole" : "exterior"})`, async () => {
    const owner = new DocumentOwner();
    try {
      await steppedCylinder(owner, hollow);
      const original = owner.view.data;
      const body = original.bodies?.[0];
      assert.ok(body);
      const upper = body.faces.find(
        (f) =>
          f.cylinder?.radius === 10 && Math.min(...f.vertices.filter((_, i) => i % 3 === 2)) > 9,
      );
      assert.ok(upper, "Upper cylindrical subdivision remains separate");
      const reply = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ face: upper.id }],
          distance,
          mode: "auto",
        },
      });
      assert.equal(reply.error, undefined);
      assert.deepEqual(owner.view.data, original);
      const result = owner.view.candidate?.bodies?.[0];
      assert.ok(result);
      const nextRadius = 10 + (hollow ? -distance : distance);
      near(result.faces.find((face) => face.id === upper.id)?.cylinder?.radius ?? NaN, nextRadius);
      const lowerArea = hollow ? 300 : 100;
      const upperArea = hollow ? 400 - nextRadius ** 2 : nextRadius ** 2;
      near(result.volume, Math.PI * 10 * (lowerArea + upperArea));
      const radii = result.faces
        .flatMap((f) =>
          f.cylinder && (!hollow || f.cylinder.outward === -1) ? [f.cylinder.radius] : [],
        )
        .sort((a, b) => a - b);
      assert.deepEqual(
        radii.map((r) => Math.round(r)),
        [10, nextRadius].sort((a, b) => a - b),
      );
      const previousLower = body.faces.find((f) => f.cylinder?.radius === 10 && f.id !== upper.id);
      assert.ok(previousLower);
      const lower = result.faces.find((f) => f.id === previousLower.id);
      assert.ok(lower, "Untouched lower cylinder retains identity");
      assert.ok(
        result.faces.some((f) => f.plane && Math.abs(f.plane.origin[2] - 10) < 1e-7),
        "New annular shoulder",
      );
      await owner.call({ kind: "accept" });
      near(owner.view.data.bodies?.[0].volume ?? NaN, result.volume);
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, original);
      const rejected = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ face: upper.id }],
          distance: hollow ? 10 : -10,
          mode: "auto",
        },
      });
      assert.match(rejected.error ?? "", /collapse/i);
      assert.deepEqual(owner.view.data, original);
    } finally {
      owner.close();
    }
  });
}

async function steppedCylinder(owner: DocumentOwner, hollow: boolean) {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "circle",
        kind: "circle" as const,
        center: { x: 0, y: 0 },
        radius: 10,
        construction: false,
      },
    ],
  };
  if (hollow)
    sketch.curves.push({
      id: "outer",
      kind: "circle",
      center: { x: 0, y: 0 },
      radius: 20,
      construction: false,
    });
  const profile = profilesFor(sketch).find((p) =>
    hollow ? p.holes.length === 1 : p.holes.length === 0,
  );
  assert.ok(profile);
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profile.key }],
          distance: 10,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  const top = owner.view.data.bodies?.[0].faces.find((f) => f.plane && f.plane.origin[2] > 9);
  assert.ok(top);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ face: top.id }],
          distance: 10,
          mode: "union",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
}
