import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Face } from "../src/model/body.js";
import { constraintCurves } from "../src/sketch/constraint-geometry.js";
import { emptySketch } from "../src/sketch/document.js";
import { createFillet, editFilletRadius } from "../src/sketch/fillet-edit.js";
import { filletCorner } from "../src/sketch/fillet-geometry.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { validateSketch } from "../src/sketch/sketch-validation.js";
import { roundedFixture } from "./body-blend-fixtures.js";
import { finish, lift, prism, square, vertical } from "./body-edge-fixtures.js";

async function offsetCornerPreview(owner: DocumentOwner, body: Body, face: Face) {
  const finish = face.blend ?? face.chamfer;
  assert.ok(finish);
  const size = face.blend?.radius ?? face.chamfer?.distance;
  assert.ok(size);
  const reply = await owner.call({
    kind: "offset-faces",
    operation: {
      faces: [{ body: body.id, face: face.id }],
      distance:
        ((face.chamfer ? 1 : -1) * size * finish.outward) / (face.chamfer?.distanceScale ?? 1),
    },
  });
  assert.equal(reply.error, undefined);
  const corner = reply.view.candidate?.bodies?.[0];
  assert.ok(corner);
  assert.ok(!corner.faces.some((f) => f.id === face.id));
  assert.equal(reply.view.offsetSelection?.length, 0);
  const before = owner.view.data;
  await owner.call({ kind: "accept" });
  await owner.call({ kind: "undo" });
  assert.equal(owner.view.data, before);
  return corner;
}

test("zero sketch fillet extends supports, removes arc relationships and fuses the hard corner", async () => {
  const a = segment({ x: 0, y: 0 }, { x: 10, y: 0 });
  const b = segment({ x: 0, y: 0 }, { x: 0, y: 10 });
  const source = { ...emptySketch(planes.XY), curves: [a, b] };
  const rounded = createFillet(source, filletCorner(a, b, "a", "a"), 2);
  const sharp = editFilletRadius(rounded.sketch, rounded.arc, 0);
  assert.ok(sharp);
  validateSketch(sharp);
  assert.deepEqual(sharp.curves, source.curves);
  assert.ok(sharp.constraints.every((c) => !constraintCurves(c).includes(rounded.arc.id)));
  assert.equal(sharp.constraints.filter((c) => c.kind === "coincident").length, 1);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: rounded.sketch })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: sharp })).error, undefined);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches[0], rounded.sketch);
  } finally {
    owner.close();
  }
});

for (const type of ["convex", "concave", "rim", "corner"] as const)
  test(`zero ${type} solid fillet heals the complete blend and supports Undo`, async () => {
    const owner = new DocumentOwner();
    try {
      await roundedFixture(owner, type);
      const before = owner.view.data;
      const body = before.bodies?.[0];
      assert.ok(body);
      const face = body.faces.find((f) => f.blend);
      assert.ok(face?.blend);
      const offsetCorner = await offsetCornerPreview(owner, body, face);
      assert.ok(!offsetCorner.faces.some((f) => f.blend));
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: face.id }], distance: 2, radius: 0 },
      });
      assert.equal(reply.error, undefined);
      const sharp = reply.view.candidate?.bodies?.[0];
      assert.ok(sharp);
      assert.equal(sharp.id, body.id);
      assert.ok(!sharp.faces.some((f) => f.blend));
      const volume = type === "rim" ? Math.PI * 64 * 10 : type === "concave" ? 3000 : 4000;
      assert.ok(Math.abs(sharp.volume - volume) < 1e-6);
      assert.ok(Math.abs(offsetCorner.volume - volume) < 1e-6);
      assert.equal(offsetCorner.faces.length, sharp.faces.length);
      if (type !== "rim") {
        const position = type === "concave" ? 10 : 0;
        assert.ok(vertical(sharp, position, position));
        assert.ok(vertical(offsetCorner, position, position));
      }
      assert.equal(reply.view.data, before);
      await owner.call({ kind: "accept" });
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, before);
    } finally {
      owner.close();
    }
  });

for (const type of ["planar", "conical", "concave", "angled"])
  test(`zero ${type} chamfer restores a hard edge from current geometry`, async () => {
    const rim = type === "conical";
    const owner = new DocumentOwner();
    try {
      const body = rim
        ? await lift(owner, {
            ...emptySketch(planes.XY),
            curves: [
              {
                id: "circle",
                kind: "circle",
                center: { x: 0, y: 0 },
                radius: 8,
                construction: false,
              },
            ],
          })
        : await prism(
            owner,
            type === "angled"
              ? [
                  [0, 0],
                  [20, 0],
                  [10, 10 * Math.sqrt(3)],
                ]
              : type === "concave"
                ? [
                    [0, 0],
                    [20, 0],
                    [20, 10],
                    [10, 10],
                    [10, 20],
                    [0, 20],
                  ]
                : square,
          );
      const edge = rim
        ? body.edges.find((e) => e.curve?.kind === "circle" && e.points[2] > 9)
        : vertical(body, type === "concave" ? 10 : 0, type === "concave" ? 10 : 0);
      assert.ok(edge);
      await finish(owner, body, [edge], 2, "chamfer");
      await owner.call({ kind: "accept" });
      const before = owner.view.data;
      const beveled = before.bodies?.[0];
      assert.ok(beveled);
      const face = beveled.faces.find((f) => f.chamfer);
      assert.ok(face?.chamfer);
      assert.ok(Math.abs(face.chamfer.distance - 2) < 1e-6);
      const offsetCorner = await offsetCornerPreview(owner, beveled, face);
      assert.ok(Math.abs(offsetCorner.volume - body.volume) < 1e-6);
      assert.equal(offsetCorner.faces.length, body.faces.length);
      if (!rim)
        assert.ok(vertical(offsetCorner, type === "concave" ? 10 : 0, type === "concave" ? 10 : 0));
      const resized = await owner.call({
        kind: "offset-faces",
        operation: {
          faces: [{ body: beveled.id, face: face.id }],
          distance: -1 / face.chamfer.distanceScale,
          radius: 3,
          chamfer: true,
        },
      });
      assert.equal(resized.error, undefined);
      assert.ok(
        Math.abs(
          (resized.view.candidate?.bodies?.[0].faces.find((f) => f.chamfer)?.chamfer?.distance ??
            0) - 3,
        ) < 1e-6,
      );
      const reply = await owner.call({
        kind: "offset-faces",
        operation: {
          faces: [{ body: beveled.id, face: face.id }],
          distance: 2 / face.chamfer.distanceScale,
          radius: 0,
          chamfer: true,
        },
      });
      assert.equal(reply.error, undefined);
      const sharp = reply.view.candidate?.bodies?.[0];
      assert.ok(sharp);
      assert.equal(sharp.id, body.id);
      assert.ok(Math.abs(sharp.volume - body.volume) < 1e-6);
      assert.equal(sharp.faces.length, body.faces.length);
      await owner.call({ kind: "accept" });
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, before);
    } finally {
      owner.close();
    }
  });
