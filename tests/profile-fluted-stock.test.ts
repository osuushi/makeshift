import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { Point } from "../src/sketch/planes.js";
import { profileCall as call } from "./profile-fixtures.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/profile-fluted-stock.json", "utf8"),
) as SketchDocument;
const facesFacing = (body: Body, outward: 1 | -1) =>
  body.faces.filter((face) => face.cylinder?.outward === outward);

function moveOutside({ x, y }: Point): Point {
  return { x: Math.abs(x) <= 1e-7 ? 0 : x + 0.25, y };
}

test("all patches of the fluted cylinder select one editable outer profile", async () => {
  const owner = new DocumentOwner();
  try {
    const { data } = await call(owner, { kind: "open", document: fixture });
    const body = data.bodies?.[0];
    assert.ok(body);
    const exterior = facesFacing(body, 1);
    const flutes = facesFacing(body, -1);
    assert.equal(exterior.length, 8);
    assert.equal(flutes.length, 8);
    const enter = (faces: string[]) =>
      call(owner, { kind: "begin-profile-edit", selection: { body: body.id, faces } });
    const captured = await enter(["f14"]);
    const profile = captured.profileEdit;
    assert.ok(profile?.region);
    const { sketch } = profile;
    assert.equal(sketch.curves.length, 3);
    assert.ok(Math.abs(profile.height - 46) < 1e-6);

    const widened = await call(owner, {
      kind: "edit",
      sketch: {
        ...sketch,
        curves: sketch.curves.map((curve) => {
          assert.equal(curve.kind, "segment");
          return { ...curve, a: moveOutside(curve.a), b: moveOutside(curve.b) };
        }),
      },
    });
    const preview = widened.profileEdit?.preview;
    assert.ok(preview, widened.profileEdit?.error);
    const widenedExterior = facesFacing(preview, 1);
    assert.equal(widenedExterior.length, 8);
    for (const face of widenedExterior)
      assert.ok(face.cylinder && Math.abs(face.cylinder.radius - 20.25) < 1e-6);
    assert.equal(facesFacing(preview, -1).length, 8);
    for (const face of flutes) {
      const before = face.cylinder;
      const after = preview.faces.find((candidate) => candidate.id === face.id)?.cylinder;
      assert.ok(before && after);
      assert.ok(Math.abs(before.radius - after.radius) < 1e-6);
      for (const axis of [0, 1])
        assert.ok(Math.abs(before.origin[axis] - after.origin[axis]) < 1e-6);
    }
    assert.ok(preview.volume > body.volume);
    assert.equal(widened.data, data);

    const applied = await call(owner, { kind: "apply-profile-edit" });
    assert.equal(applied.data.bodies?.[0].id, body.id);
    const reopened = await enter(widenedExterior.map((face) => face.id));
    assert.equal(reopened.profileEdit?.sketch.curves.length, 3);
    await call(owner, { kind: "cancel-profile-edit" });
    const undone = await call(owner, { kind: "undo" });
    assert.equal(undone.data, data);
    assert.equal(undone.canUndo, false);
  } finally {
    owner.close();
  }
});
