import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { exportBodies } from "../src/model/mesh-export.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { cap, shell } from "./shell-fixtures.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/shell-cylindrical-splines.json", "utf8"),
) as {
  document: SketchDocument;
  opening: string;
  section: { height: number; area: number; perimeter: number };
};
async function open(owner: DocumentOwner): Promise<Body> {
  assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  return body;
}
function expectedVolume(thickness: number, openings: number): number {
  // Independent parallel-section/sharp-cap formula for this simple prism.
  const { area, perimeter, height } = fixture.section;
  const caps = 2 - openings;
  if (thickness < 0)
    return (
      area * height -
      (area + perimeter * thickness + Math.PI * thickness ** 2) * (height + caps * thickness)
    );
  return (
    (area + perimeter * thickness + Math.PI * thickness ** 2) * (height + caps * thickness) -
    area * height
  );
}
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-4, `${actual} != ${expected}`);
}

test("captured cylindrical splines shell inward/outward, closed or with either/both caps open", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await open(owner);
    const original = owner.view.data;
    for (const faces of [[], [fixture.opening], [cap(body, 0)], [cap(body, 0), fixture.opening]]) {
      for (const thickness of [-1, -4, 1, 4]) {
        const wall = await shell(owner, body, thickness, faces);
        near(wall.volume, expectedVolume(thickness, faces.length));
        assert.equal(owner.view.data, original);
        for (const face of body.faces.filter((f) => !faces.includes(f.id)))
          assert.ok(
            wall.faces.some((f) => f.id === face.id),
            `Retained face ${face.id}`,
          );
        for (const face of faces) assert.ok(!wall.faces.some((f) => f.id === face));
        const radii = wall.faces.flatMap((f) => (f.cylinder ? [f.cylinder.radius] : []));
        for (const radius of [11 - thickness, 22 - thickness, 16.155494421403514 + thickness])
          assert.ok(
            radii.some((r) => Math.abs(r - radius) < 1e-6),
            `Missing radius ${radius}`,
          );
        await owner.call({ kind: "discard" });
      }
    }
  } finally {
    owner.close();
  }
});

test("capture conversion preserves rejection, Undo, reopen and subsequent face editing", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await open(owner);
    const before = owner.view.data;
    await shell(owner, body, -1, [fixture.opening]);
    for (const thickness of [-17, -30, 11, 12]) {
      const reply = await owner.call({
        kind: "shell",
        operation: { thickness, selection: [{ body: body.id, faces: [fixture.opening] }] },
      });
      assert.ok(reply.error, `Reject collapsed wall/radius ${thickness}`);
      assert.equal(reply.view.candidate, null);
      assert.equal(reply.view.data, before);
      assert.ok((await owner.call({ kind: "accept" })).error);
    }
    // At -16 the 16.155 mm convex radius survives. All-surface intersections
    // close the pinched cavity; this was formerly rejected despite a valid result.
    const pinched = await shell(owner, body, -16, [fixture.opening]);
    assert.ok(pinched.volume > 0 && pinched.volume < body.volume);
    assert.ok(
      pinched.faces.some(
        (f) => f.cylinder && Math.abs(f.cylinder.radius - (16.155494421403514 - 16)) < 1e-6,
      ),
    );
    assert.ok(pinched.faces.some((f) => f.plane && Math.abs(f.plane.origin[2] - 16) < 1e-6));
    for (const format of ["stl", "3mf"] as const)
      assert.ok(exportBodies([pinched], format).length > 0);
    await owner.call({ kind: "discard" });
    const wall = await shell(owner, body, -4, [fixture.opening]);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
    assert.deepEqual(
      owner.view.data.bodies?.[0].faces.map((f) => f.id),
      wall.faces.map((f) => f.id),
    );
    const reopened = owner.view.data;
    const edited = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: body.id, face: cap(body, 0) }], distance: 0.2 },
    });
    assert.equal(edited.error, undefined);
    assert.ok((edited.view.candidate?.bodies?.[0].volume ?? 0) > wall.volume);
    await owner.call({ kind: "discard" });
    assert.equal(owner.view.data.bodies?.[0].brep, reopened.bodies?.[0].brep);
  } finally {
    owner.close();
  }
});

test("captured spline shelling is independent of body placement and orientation", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await open(owner);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            axis: [1, 2, 3],
            pivot: [0, 0, 0],
            angle: 57,
            translation: [20, -30, 40],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const moved = owner.view.data.bodies?.[0];
    assert.ok(moved);
    for (const faces of [[], [fixture.opening]]) {
      for (const thickness of [-1, 1]) {
        const wall = await shell(owner, moved, thickness, faces);
        near(wall.volume, expectedVolume(thickness, faces.length));
        await owner.call({ kind: "discard" });
      }
    }
  } finally {
    owner.close();
  }
});
