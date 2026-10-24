import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { kernelInput } from "../src/backend/kernel-input.js";
import { boundary } from "../src/backend/profile-boundary.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Extrusion } from "../src/model/body.js";
import { exportMesh } from "../src/model/export-mesh.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { planeNormal, planes } from "../src/sketch/planes.js";
import { profileAt } from "../src/sketch/profiles.js";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const fixture = (name = "tangent-circles"): SketchDocument =>
  JSON.parse(readFileSync(`tests/fixtures/${name}.json`, "utf8")).document;
const area = 75 * Math.PI;
function extrusion(document: SketchDocument, distance: number): Extrusion {
  const sketch = document.sketches[0];
  const selected = profileAt(sketch, { x: -5, y: 0 });
  assert.ok(selected);
  near(selected.area, area);
  return {
    sources: [{ sketch: sketch.id, profile: selected.key }],
    distance,
    mode: "auto",
    eligibleTargets: document.bodies?.map((body) => body.id),
  };
}

for (const name of ["tangent-circles", "tangent-circles-post"])
  for (const distance of [6, -1])
    test(`${name}: pinched crescent extrudes ${distance} mm with cancel, history, reopen and Move`, async () => {
      const owner = new DocumentOwner();
      try {
        assert.equal(
          (await owner.call({ kind: "open", document: fixture(name) })).error,
          undefined,
        );
        const before = owner.view.data;
        const operation = extrusion(before, distance);
        const expected = (before.bodies?.[0].volume ?? 0) + area * distance;
        assert.equal(
          (await owner.call({ kind: "extrude", extrusion: operation })).error,
          undefined,
        );
        assert.deepEqual(owner.view.data, before);
        near(owner.view.candidate?.bodies?.[0].volume ?? 0, expected);
        await owner.call({ kind: "cancel-preview" });
        assert.deepEqual(owner.view.data, before);
        assert.equal(
          (await owner.call({ kind: "extrude", extrusion: operation })).error,
          undefined,
        );
        assert.equal((await owner.call({ kind: "accept" })).error, undefined);
        const accepted = owner.view.data;
        assert.equal(accepted.bodies?.length, 1);
        assert.deepEqual(accepted.sketches, before.sketches);
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data, before);
        await owner.call({ kind: "redo" });
        assert.deepEqual(owner.view.data, accepted);
        assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
        const reopened = owner.view.data;
        const body = reopened.bodies?.[0];
        assert.ok(body);
        near(body.volume, expected);
        // Exact tangent topology is a valid BRep, but its zero-thickness contact
        // is not a closed manifold mesh. Do not weaken the independent export guard.
        if (distance > 0)
          assert.throws(() => exportMesh(body), /not closed and consistently oriented/);
        else assert.ok(exportMesh(body).triangles.length > 0);
        assert.equal(
          (
            await owner.call({
              kind: "transform-bodies",
              transform: {
                ids: [body.id],
                axis: [0, 0, 1],
                angle: 0,
                pivot: [0, 0, 0],
                translation: [3, 4, 5],
                duplicate: false,
              },
            })
          ).error,
          undefined,
        );
        const moved = owner.view.data.bodies?.[0];
        assert.ok(moved);
        near(moved.volume, expected);
        near(moved.bounds[2], body.bounds[2] + 5);
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data, reopened);
      } finally {
        owner.close();
      }
    });

test("tangent crescents retain exact area for rotated contacts, both signs and symmetric depth", async () => {
  const owner = new DocumentOwner();
  try {
    const original = fixture();
    const operation = extrusion(original, 6);
    for (const [plane, angle] of [
      [planes.XY, 0],
      [planes.XY, 0.31],
      [planes.XZ, Math.PI / 2],
      [planes.YZ, -0.7],
    ] as const) {
      const curves = original.sketches[0].curves.map((curve) => {
        assert.equal(curve.kind, "circle");
        return {
          ...curve,
          center: {
            x: curve.center.x * Math.cos(angle) - curve.center.y * Math.sin(angle),
            y: curve.center.x * Math.sin(angle) + curve.center.y * Math.cos(angle),
          },
        };
      });
      const document = {
        ...original,
        bodies: [],
        sketches: [{ ...original.sketches[0], plane, curves }],
      };
      assert.equal((await owner.call({ kind: "open", document })).error, undefined);
      for (const distance of [-6, 6])
        for (const symmetric of [false, true]) {
          assert.equal(
            (
              await owner.call({
                kind: "extrude",
                extrusion: { ...operation, distance, symmetric, mode: "new" },
              })
            ).error,
            undefined,
          );
          const body = owner.view.candidate?.bodies?.[0];
          assert.ok(body);
          near(body.volume, area * 6);
          const normal = planeNormal(plane);
          const axis = normal.findIndex((value) => Math.abs(value) > 0.5);
          const travel = distance * normal[axis];
          near(body.bounds[axis], symmetric ? -3 : Math.min(0, travel));
          near(body.bounds[axis + 3], symmetric ? 3 : Math.max(0, travel));
          const radii = body.faces.flatMap((face) => (face.cylinder ? [face.cylinder.radius] : []));
          assert.ok(radii.some((radius) => Math.abs(radius - 5) < 1e-8));
          assert.ok(radii.some((radius) => Math.abs(radius - 10) < 1e-8));
          await owner.call({ kind: "cancel-preview" });
        }
    }
  } finally {
    owner.close();
  }
});

test("touching-hole construction rejects crossing and overlapping holes, then recovers", async () => {
  const kernel = new SolidCalculator();
  const document = fixture();
  const input = kernelInput(document, { ...extrusion(document, 6), mode: "new" }, []);
  const circle = (x: number, radius: number) =>
    boundary(
      [
        {
          curve: { id: "hole", kind: "circle", center: { x, y: 0 }, radius, construction: false },
          start: 0,
          end: 2 * Math.PI,
        },
      ],
      planes.XY,
    );
  try {
    for (const holes of [[circle(6, 5)], [circle(-2, 4), circle(2, 4)]])
      await assert.rejects(
        kernel.calculate({ ...input, profiles: [{ outer: circle(0, 10), holes }] }),
        /Profile holes overlap or cross the outer boundary/,
      );
    const reply = await kernel.calculate(input);
    near(reply.results[0].volume, area * 6);
  } finally {
    kernel.close();
  }
});
