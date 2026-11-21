import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle } from "../src/sketch/arc-geometry.js";
import type { Sketch, SketchDocument } from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { coplanar, type Point } from "../src/sketch/planes.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/profile-planar-cut.json", "utf8"),
) as SketchDocument;
const cutFaces = ["f5", "f6", "f8", "f9"];
const radius = 14.008925726121898;

async function call(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply.view;
}

function resizeProfile(sketch: Sketch, radiusDelta: number, capRise = 0): Sketch {
  const shift = (point: Point) => ({
    x: Math.abs(point.x) <= 1e-7 ? 0 : point.x + radiusDelta,
    y: Math.abs(point.y) <= 1e-6 ? point.y + capRise : point.y,
  });
  const curves = sketch.curves.map((curve) => {
    assert.ok(curve.kind !== "circle");
    const ends = { a: shift(curve.a), b: shift(curve.b) };
    return curve.kind === "bezier"
      ? { ...curve, ...ends, c1: shift(curve.c1), c2: shift(curve.c2) }
      : { ...curve, ...ends };
  });
  return { ...sketch, curves };
}

test("an intact meridian supplies the end cap before recutting the captured planar notch", async () => {
  const owner = new DocumentOwner();
  try {
    const { data } = await call(owner, { kind: "open", document: fixture });
    const body = data.bodies?.[0];
    assert.ok(body);
    const fromCap = await call(owner, {
      kind: "begin-profile-edit",
      selection: { body: body.id, faces: ["f7"] },
    });
    assert.ok(fromCap.profileEdit?.region);
    await call(owner, { kind: "cancel-profile-edit" });

    const selection = { body: body.id, faces: ["f4"] };
    const entered = await call(owner, { kind: "begin-profile-edit", selection });
    const sketch = entered.profileEdit?.sketch;
    assert.ok(sketch && entered.profileEdit?.region);
    const cap = sketch.curves.find(
      (curve) =>
        curve.kind === "segment" && Math.abs(curve.a.y) < 1e-6 && Math.abs(curve.b.y) < 1e-6,
    );
    assert.ok(cap?.kind === "segment");
    assert.ok(Math.abs(Math.abs(cap.a.x - cap.b.x) - radius) < 1e-6);

    const moved = await call(owner, { kind: "edit", sketch: resizeProfile(sketch, 0.5, 1) });
    const preview = moved.profileEdit?.preview;
    assert.ok(preview, moved.profileEdit?.error);
    assert.ok(Math.abs(preview.bounds[3] - radius - 0.5) < 1e-6);
    assert.ok(Math.abs(preview.bounds[2] - 1) < 1e-6);
    assert.ok(cutFaces.every((id) => preview.faces.some((face) => face.id === id)));
    const depthFace = preview.faces.find((face) => face.id === "f5");
    assert.ok(depthFace?.plane && Math.abs(depthFace.plane.origin[2] - 14) < 1e-6);
    assert.equal(moved.data, data);

    const missed = await call(owner, { kind: "edit", sketch: resizeProfile(sketch, 0.5, 16) });
    const cleared = missed.profileEdit?.preview;
    assert.ok(cleared, missed.profileEdit?.error);
    assert.ok(cleared.faces.every((face) => !cutFaces.includes(face.id)));
    await call(owner, { kind: "undo" });

    const applied = await call(owner, { kind: "apply-profile-edit" });
    assert.equal(applied.data.bodies?.[0].id, body.id);
    const reopened = await call(owner, { kind: "begin-profile-edit", selection });
    assert.ok(reopened.profileEdit?.region);
    await call(owner, { kind: "cancel-profile-edit" });
    const undone = await call(owner, { kind: "undo" });
    assert.equal(undone.data, data);
    assert.equal(undone.canUndo, false);
  } finally {
    owner.close();
  }
});

test("a notched turning recovers the exact meridian of its curved support", async () => {
  const document = JSON.parse(
    readFileSync("tests/fixtures/profile-notched-torus.json", "utf8"),
  ) as SketchDocument;
  const owner = new DocumentOwner();
  try {
    const { data } = await call(owner, { kind: "open", document });
    const body = data.bodies?.[0];
    assert.ok(body);
    const selection = { body: body.id, faces: ["f6"] };
    const { profileEdit } = await call(owner, { kind: "begin-profile-edit", selection });
    const sketch = profileEdit?.sketch;
    assert.ok(sketch && profileEdit?.region);
    const shoulder = sketch.curves.find((curve) => curve.kind === "arc");
    assert.ok(shoulder);
    assert.ok(Math.abs(arcCircle(shoulder).radius - 7) < 1e-6);

    const moved = await call(owner, { kind: "edit", sketch: resizeProfile(sketch, 0.25) });
    const preview = moved.profileEdit?.preview;
    assert.ok(preview, moved.profileEdit?.error);
    const widened = preview.faces.find((face) => face.id === "f6")?.cylinder;
    assert.ok(widened && Math.abs(widened.radius - 10.25) < 1e-6);
    assert.ok(preview.volume > body.volume);
    for (const id of ["f4", "f5", "f7"]) {
      const before = body.faces.find((face) => face.id === id)?.plane;
      const after = preview.faces.find((face) => face.id === id)?.plane;
      assert.ok(before && after && coplanar(before, after), id);
    }
    assert.equal(moved.data, data);

    await call(owner, { kind: "apply-profile-edit" });
    const reopened = await call(owner, { kind: "begin-profile-edit", selection });
    assert.ok(reopened.profileEdit?.region);
    await call(owner, { kind: "cancel-profile-edit" });
    const undone = await call(owner, { kind: "undo" });
    assert.equal(undone.data, data);
    assert.equal(undone.canUndo, false);
  } finally {
    owner.close();
  }
});
