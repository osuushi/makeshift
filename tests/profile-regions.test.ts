import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Circle, Segment } from "../src/sketch/document.js";
import { emptySketch } from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { planes } from "../src/sketch/planes.js";
import { lift } from "./body-edge-fixtures.js";

const length = 12;
const circle = (id: string, x: number, y: number, radius: number): Circle => ({
  id,
  kind: "circle",
  center: { x, y },
  radius,
  construction: false,
});
const line = (id: string, ax: number, ay: number, bx: number, by: number): Segment => ({
  id,
  kind: "segment",
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  construction: false,
});
const cylinder = (owner: DocumentOwner) =>
  lift(owner, { ...emptySketch(planes.XY), curves: [circle("disk", 0, 0, 5)] }, length);

async function call(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply.view;
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `Expected ${expected}, got ${actual}`);
}

test("untrimmed crossing spans define the inner profile while open tails stay in the sketch", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await cylinder(owner);
    const { data: original } = await call(owner, {
      kind: "open",
      document: { ...owner.view.data, sketches: [] },
    });
    const selection = { body: body.id, faces: [] };
    const opened = await call(owner, { kind: "begin-profile-edit", selection });
    const sketch = opened.profileEdit?.sketch;
    assert.ok(sketch && opened.profileEdit?.region);
    const extras = [line("branch", 5, 5, 4, 5), line("stray", 10, -20, 12, -23)];
    const extended = { ...sketch, curves: [...sketch.curves, ...extras] };
    const withExtras = await call(owner, { kind: "edit", sketch: extended });
    assert.equal(withExtras.profileEdit?.error, undefined);
    assert.equal(withExtras.profileEdit?.preview, undefined);
    const unchanged = await call(owner, { kind: "apply-profile-edit" });
    assert.equal(unchanged.data, original);
    assert.equal(unchanged.canUndo, false);

    const reopened = await call(owner, { kind: "begin-profile-edit", selection });
    const second = reopened.profileEdit?.sketch;
    assert.ok(second);
    const chord = line("chord", 3, -2, 3, length + 2);
    const edited = await call(owner, {
      kind: "edit",
      sketch: { ...second, curves: [...second.curves, ...extras, chord] },
    });
    const region = edited.profileEdit?.region;
    const preview = edited.profileEdit?.preview;
    assert.ok(region && preview, edited.profileEdit?.error);
    assert.ok(region.outer.some((span) => span.curve.id === chord.id));
    assert.ok(!region.outer.some((span) => span.curve.id === "branch"));
    assert.equal(edited.profileEdit?.sketch.curves.length, second.curves.length + 3);
    close(preview.volume, 9 * Math.PI * length);
    assert.deepEqual(
      preview.faces
        .filter((face) => face.plane)
        .map((face) => face.id)
        .sort(),
      body.faces
        .filter((face) => face.plane)
        .map((face) => face.id)
        .sort(),
    );
    assert.equal(edited.data, original);
    await call(owner, { kind: "apply-profile-edit" });
    const undone = await call(owner, { kind: "undo" });
    assert.equal(undone.data, original);
    assert.equal(undone.canUndo, false);
  } finally {
    owner.close();
  }
});

test("a complete off-axis loop can drive a profile and be edited again", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await cylinder(owner);
    const selection = { body: body.id, faces: [] };
    const { profileEdit } = await call(owner, { kind: "begin-profile-edit", selection });
    assert.ok(profileEdit);
    const edited = await call(owner, {
      kind: "edit",
      sketch: {
        ...profileEdit.sketch,
        constraints: [],
        curves: [circle("outer", 9, 6, 2), circle("inner", 4, 6, 1.5)],
      },
    });
    assert.ok(edited.profileEdit?.preview, edited.profileEdit?.error);
    assert.ok(edited.profileEdit.region?.outer.every((span) => span.curve.id === "inner"));
    close(edited.profileEdit.preview.volume, 2 * Math.PI ** 2 * 4 * 1.5 ** 2);
    const applied = await call(owner, { kind: "apply-profile-edit" });
    const torus = applied.data.bodies?.[0].faces[0];
    assert.ok(torus);
    const reopened = await call(owner, {
      kind: "begin-profile-edit",
      selection: { ...selection, faces: [torus.id] },
    });
    const [curve] = reopened.profileEdit?.sketch.curves ?? [];
    assert.ok(curve?.kind === "circle");
    close(curve.center.x, 4);
    close(curve.radius, 1.5);
  } finally {
    owner.close();
  }
});

test("a closed profile on the opposite side of the axis retains its enclosed hole", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await cylinder(owner);
    const selection = { body: body.id, faces: [] };
    const { profileEdit } = await call(owner, { kind: "begin-profile-edit", selection });
    assert.ok(profileEdit);
    const edited = await call(owner, {
      kind: "edit",
      sketch: {
        ...profileEdit.sketch,
        constraints: [],
        curves: [
          line("bottom", -5, 0, -2, 0),
          line("inner", -2, 0, -2, length),
          line("cap", -2, length, -5, length),
          line("outer", -5, length, -5, 0),
          circle("cavity", -3.5, 6, 0.6),
        ],
      },
    });
    assert.ok(edited.profileEdit?.preview, edited.profileEdit?.error);
    assert.equal(edited.profileEdit.region?.holes.length, 1);
    close(
      edited.profileEdit.preview.volume,
      21 * Math.PI * length - 2 * Math.PI ** 2 * 3.5 * 0.6 ** 2,
    );
    await call(owner, { kind: "apply-profile-edit" });
    const reopened = await call(owner, { kind: "begin-profile-edit", selection });
    assert.equal(reopened.profileEdit?.region?.holes.length, 1);
  } finally {
    owner.close();
  }
});
