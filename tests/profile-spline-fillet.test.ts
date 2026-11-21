import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Sketch, SketchDocument } from "../src/sketch/document.js";
import type { Point } from "../src/sketch/planes.js";
import { prism } from "./body-edge-fixtures.js";
import { profileCall as call } from "./profile-fixtures.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/profile-spline-fillet.json", "utf8"),
) as SketchDocument;

function widen(sketch: Sketch, by: number): Sketch {
  const shift = (point: Point) => ({ ...point, x: Math.abs(point.x) <= 1e-7 ? 0 : point.x + by });
  const curves = sketch.curves.map((curve) => {
    assert.ok(curve.kind !== "circle");
    const ends = { a: shift(curve.a), b: shift(curve.b) };
    return curve.kind === "bezier"
      ? { ...curve, ...ends, c1: shift(curve.c1), c2: shift(curve.c2) }
      : { ...curve, ...ends };
  });
  return { ...sketch, curves };
}

test("Edit Profile recovers the captured rolling fillet as an editable full turn", async () => {
  const owner = new DocumentOwner();
  try {
    const { data } = await call(owner, { kind: "open", document: fixture });
    const body = data.bodies?.[0];
    assert.ok(body);
    const selection = { body: body.id, faces: ["f0"] };
    const captured = await call(owner, { kind: "begin-profile-edit", selection });
    assert.ok(captured.profileEdit?.region);
    assert.ok(captured.profileEdit.sketch.curves.some((curve) => curve.kind === "bezier"));
    assert.equal((await call(owner, { kind: "apply-profile-edit" })).data, data);
    assert.equal(owner.view.canUndo, false);

    const blend = { body: body.id, faces: ["f1"] };
    const entered = await call(owner, { kind: "begin-profile-edit", selection: blend });
    const sketch = entered.profileEdit?.sketch;
    assert.ok(sketch);
    const moved = await call(owner, { kind: "edit", sketch: widen(sketch, 0.25) });
    const preview = moved.profileEdit?.preview;
    assert.ok(preview, moved.profileEdit?.error);
    assert.ok(preview.volume > body.volume);
    assert.ok(Math.abs(preview.bounds[3] - 16.75) < 1e-6);
    assert.ok(Math.abs(preview.bounds[5] - 36) < 1e-6);
    assert.ok(preview.faces.some((face) => face.id === "f0"));
    assert.equal(moved.data, data);

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

test("turn recovery rejects a closed-spline body with an unrelated addition", async () => {
  const owner = new DocumentOwner();
  try {
    const { data } = await call(owner, { kind: "open", document: fixture });
    const body = data.bodies?.[0];
    assert.ok(body);
    const tool = await prism(
      owner,
      [
        [-2, 14],
        [2, 14],
        [2, 18],
        [-2, 18],
      ],
      5,
    );
    await call(owner, {
      kind: "boolean-bodies",
      operation: { mode: "union", ids: [body.id, tool.id], keepOriginals: false },
    });
    const { data: joined } = await call(owner, { kind: "accept" });
    assert.equal(joined.bodies?.length, 1);
    const result = joined.bodies[0];
    assert.ok(result.volume > body.volume);

    const rejected = await owner.call({
      kind: "begin-profile-edit",
      selection: { body: result.id, faces: [] },
    });
    assert.match(rejected.error ?? "", /does not reproduce the turned body/);
    assert.equal(rejected.view.profileEdit, undefined);
    assert.equal(rejected.view.data, joined);
  } finally {
    owner.close();
  }
});
