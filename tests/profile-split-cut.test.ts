import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import type { Sketch, SketchDocument } from "../src/sketch/document.js";
import type { Point } from "../src/sketch/planes.js";
import { profileCall as call } from "./profile-fixtures.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/profile-split-cut.json", "utf8"),
) as SketchDocument;
const walls = (body: Body) => body.faces.filter((face) => face.cylinder?.outward === -1);

function moveRadially(sketch: Sketch, by: number): Sketch {
  const shift = ({ x, y }: Point) => ({ x: Math.abs(x) <= 1e-7 ? 0 : x + by, y });
  return {
    ...sketch,
    curves: sketch.curves.map((curve) => {
      assert.ok(curve.kind !== "circle");
      const ends = { a: shift(curve.a), b: shift(curve.b) };
      return curve.kind === "bezier"
        ? { ...curve, ...ends, c1: shift(curve.c1), c2: shift(curve.c2) }
        : { ...curve, ...ends };
    }),
  };
}

test("a turned spline join with two patches of one lengthwise cut can be edited and reopened", async () => {
  const owner = new DocumentOwner();
  try {
    const { data } = await call(owner, { kind: "open", document: fixture });
    const body = data.bodies?.[0];
    assert.ok(body);
    const selection = { body: body.id, faces: ["f0"] };
    const originalCut = walls(body);
    assert.equal(originalCut.length, 2);
    const entered = await call(owner, { kind: "begin-profile-edit", selection });
    const sketch = entered.profileEdit?.sketch;
    assert.ok(sketch);
    assert.ok(sketch.curves.some((curve) => curve.kind === "bezier"));
    assert.equal(sketch.curves.filter((curve) => curve.kind === "segment").length, 2);

    const changed = await call(owner, { kind: "edit", sketch: moveRadially(sketch, -0.25) });
    const preview = changed.profileEdit?.preview;
    assert.ok(preview, changed.profileEdit?.error);
    assert.ok(Math.abs(preview.bounds[0] - (body.bounds[0] + 0.25)) < 1e-6);
    assert.ok(preview.volume < body.volume);
    const recut = walls(preview);
    assert.deepEqual(
      recut.map((face) => face.id).sort(),
      originalCut.map((face) => face.id).sort(),
    );
    for (const face of recut) {
      assert.equal(face.cylinder?.radius, originalCut[0].cylinder?.radius);
      assert.equal(face.cylinder?.origin[0], originalCut[0].cylinder?.origin[0]);
    }
    assert.equal(changed.data, data);
    const applied = await call(owner, { kind: "apply-profile-edit" });
    assert.equal(applied.data.bodies?.[0].id, body.id);
    assert.ok((await call(owner, { kind: "begin-profile-edit", selection })).profileEdit);
    await call(owner, { kind: "cancel-profile-edit" });
    assert.equal((await call(owner, { kind: "undo" })).data, data);
  } finally {
    owner.close();
  }
});

test("a replacement off-axis region with a hole reopens even after a split cut is recut", async () => {
  const owner = new DocumentOwner();
  try {
    const { data } = await call(owner, { kind: "open", document: fixture });
    const body = data.bodies?.[0];
    assert.ok(body);
    const selection = { body: body.id, faces: [] };
    const entered = await call(owner, { kind: "begin-profile-edit", selection });
    const sketch = entered.profileEdit?.sketch;
    assert.ok(sketch);
    const moveEnd = (point: Point) => ({ ...point, x: Math.abs(point.x) <= 1e-7 ? 2 : point.x });
    const curves: Sketch["curves"][number][] = sketch.curves.map((curve) => {
      assert.ok(curve.kind !== "circle");
      return { ...curve, a: moveEnd(curve.a), b: moveEnd(curve.b) };
    });
    const [bottom, top] = [curves[0], curves.at(-1)];
    assert.ok(bottom.kind === "segment" && top?.kind === "segment");
    curves.push(
      { id: "bore", kind: "segment", a: top.b, b: bottom.a, construction: false },
      { id: "cavity", kind: "circle", center: { x: 4, y: 9 }, radius: 0.5, construction: false },
    );
    const changed = await call(owner, { kind: "edit", sketch: { ...sketch, curves } });
    const preview = changed.profileEdit?.preview;
    assert.ok(preview, changed.profileEdit?.error);
    assert.ok(
      walls(body).every((wall) => walls(preview).some((descendant) => descendant.id === wall.id)),
    );
    await call(owner, { kind: "apply-profile-edit" });
    const reopened = await call(owner, { kind: "begin-profile-edit", selection });
    assert.equal(reopened.profileEdit?.region?.holes.length, 1);
    await call(owner, { kind: "cancel-profile-edit" });
    assert.equal((await call(owner, { kind: "undo" })).data, data);
  } finally {
    owner.close();
  }
});
