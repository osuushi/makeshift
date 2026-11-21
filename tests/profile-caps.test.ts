import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { type Arc, emptySketch, type Sketch } from "../src/sketch/document.js";
import { createFillet } from "../src/sketch/fillet-edit.js";
import { filletCorner } from "../src/sketch/fillet-geometry.js";
import { type Point, planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { lift } from "./body-edge-fixtures.js";
import { profileCall as call } from "./profile-fixtures.js";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= 1e-6, `${actual} should equal ${expected}`);

const notchCenter = { x: 3, y: 9.5 };
const notchRadius = Math.sqrt(46.25);

function disk(center: Point = { x: 0, y: 0 }, radius = 5): Sketch {
  return {
    ...emptySketch(planes.XY),
    curves: [{ id: "circle", kind: "circle", center, radius, construction: false }],
  };
}

async function notch(owner: DocumentOwner, body: Body) {
  const cut = disk(notchCenter, notchRadius);
  await call(owner, { kind: "edit", sketch: cut });
  await call(owner, {
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: cut.id, profile: profilesFor(cut)[0].key }],
      distance: 31,
      mode: "subtract",
      targets: [body.id],
    },
  });
  await call(owner, { kind: "accept" });
}

function translateEnds(sketch: Sketch, map: (point: Point) => Point): Sketch {
  return {
    ...sketch,
    curves: sketch.curves.map((curve) => {
      assert.equal(curve.kind, "segment");
      return { ...curve, a: map(curve.a), b: map(curve.b) };
    }),
  };
}

const inwardWall = (body: Body) => body.faces.find((face) => face.cylinder?.outward === -1);

test("edit the exterior and both cap rims of a turned body with a lengthwise cut", async () => {
  const owner = new DocumentOwner();
  try {
    const stock = await lift(owner, disk(), 31);
    await notch(owner, stock);
    const { data } = await call(owner, { kind: "open", document: owner.view.data });
    const [body] = data.bodies ?? [];
    assert.ok(body);
    const outer = body.faces.find((face) => face.cylinder?.outward === 1);
    const stationary = inwardWall(body);
    assert.ok(outer && stationary);
    const selection = { body: body.id, faces: [outer.id] };
    const opened = await call(owner, { kind: "begin-profile-edit", selection });
    const sketch = opened.profileEdit?.sketch;
    assert.ok(sketch);
    assert.equal(opened.profileEdit?.endGuides, false);
    assert.equal(sketch.curves.length, 3);
    const moved = await call(owner, {
      kind: "edit",
      sketch: translateEnds(sketch, ({ x, y }) => ({ x, y: y * (36 / 31) - 2 })),
    });
    const preview = moved.profileEdit?.preview;
    assert.ok(preview, moved.profileEdit?.error);
    close(preview.bounds[2], -2);
    close(preview.bounds[5], 34);
    close(preview.volume, (body.volume * 36) / 31);
    const recut = inwardWall(preview);
    assert.equal(recut?.id, stationary.id);
    assert.ok(recut?.cylinder && stationary.cylinder);
    close(recut.cylinder.radius, stationary.cylinder.radius);
    close(recut.cylinder.origin[0], stationary.cylinder.origin[0]);
    close(recut.cylinder.origin[1], stationary.cylinder.origin[1]);
    assert.equal(moved.data, data);
    const widened = await call(owner, {
      kind: "edit",
      sketch: translateEnds(sketch, ({ x, y }) => ({ x: x === 0 ? 0 : 6, y })),
    });
    assert.ok(widened.profileEdit?.preview, widened.profileEdit?.error);
    assert.deepEqual(
      widened.profileEdit.preview.faces
        .filter((face) => face.cylinder)
        .map((face) => face.id)
        .sort(),
      [outer.id, stationary.id].sort(),
    );
    const applied = await call(owner, { kind: "apply-profile-edit" });
    const reopened = await call(owner, { kind: "begin-profile-edit", selection });
    assert.equal(reopened.profileEdit?.sketch.curves.length, 3);
    await call(owner, { kind: "cancel-profile-edit" });
    assert.equal((await call(owner, { kind: "undo" })).data, data);
    assert.equal((await call(owner, { kind: "redo" })).data, applied.data);
    await call(owner, { kind: "undo" });

    await call(owner, { kind: "begin-profile-edit", selection });
    const shrinking = owner.view.profileEdit?.sketch;
    assert.ok(shrinking);
    const radius = Math.hypot(notchCenter.x, notchCenter.y) - notchRadius;
    const tangent = await call(owner, {
      kind: "edit",
      sketch: translateEnds(shrinking, ({ x, y }) => ({ x: x === 0 ? 0 : radius, y })),
    });
    const round = tangent.profileEdit?.preview;
    assert.ok(round, tangent.profileEdit?.error);
    assert.equal(inwardWall(round), undefined);
    close(round.volume, Math.PI * radius ** 2 * 31);
  } finally {
    owner.close();
  }
});

test("a flat cap is a regular profile curve that can be moved and filleted", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, disk(), 31);
    const cap = body.faces.find(
      (face) => face.plane && face.bounds && Math.abs(face.bounds[2] - 31) < 1e-7,
    );
    assert.ok(cap);
    const opened = await call(owner, {
      kind: "begin-profile-edit",
      selection: { body: body.id, faces: [cap.id] },
    });
    const sketch = opened.profileEdit?.sketch;
    assert.ok(sketch);
    const taller = translateEnds(sketch, ({ x, y }) => ({ x, y: y > 30 ? 33 : y }));
    const moved = await call(owner, { kind: "edit", sketch: taller });
    assert.ok(moved.profileEdit?.preview, moved.profileEdit?.error);
    const capAfterMove = moved.profileEdit.preview.faces.find((face) => face.id === cap.id);
    assert.ok(capAfterMove?.plane && capAfterMove.bounds);
    close(capAfterMove.bounds[2], 33);
    const [bottom, wall, top] = taller.curves;
    assert.ok(wall.kind === "segment" && top.kind === "segment");
    const draft = createFillet(taller, filletCorner(wall, top, "b", "a"), 2.5);
    const rounded = await call(owner, { kind: "edit", sketch: draft.sketch });
    const preview = rounded.profileEdit?.preview;
    assert.ok(preview, rounded.profileEdit?.error);
    close(preview.bounds[5], 33);
    const r = 2.5;
    const roundedVolume = Math.PI * (25 * (33 - r) + r ** 3 * (1 + Math.PI / 2 + 2 / 3));
    close(preview.volume, roundedVolume);
    const diskCap = preview.faces.find((face) => face.id === cap.id);
    assert.ok(diskCap?.bounds);
    close(diskCap.bounds[3], 2.5);

    const removed = await call(owner, { kind: "remove", sketchId: sketch.id, ids: [bottom.id] });
    assert.equal(removed.profileEdit?.region, undefined);
    assert.match(removed.profileEdit?.error ?? "", /close a region/i);
    await call(owner, { kind: "undo" });
    const applied = await call(owner, { kind: "apply-profile-edit" });
    const result = applied.data.bodies?.[0];
    assert.equal(result?.id, body.id);
    const reopened = await call(owner, {
      kind: "begin-profile-edit",
      selection: { body: body.id, faces: [cap.id] },
    });
    assert.equal(
      reopened.profileEdit?.sketch.curves.filter((curve) => curve.kind === "arc").length,
      1,
    );
  } finally {
    owner.close();
  }
});

test("dragging a bowed profile keeps the flat end caps on the revolution axis", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, disk(), 31);
    const opened = await call(owner, {
      kind: "begin-profile-edit",
      selection: { body: body.id, faces: [] },
    });
    const sketch = opened.profileEdit?.sketch;
    assert.ok(sketch);
    const [bottom, wall, top] = sketch.curves;
    assert.ok(bottom.kind === "segment" && wall.kind === "segment" && top.kind === "segment");
    const bowed: Arc = { ...wall, kind: "arc", a: { x: 2.3, y: 0 }, bulge: -0.15 };
    const fillet = createFillet(
      { ...sketch, curves: [{ ...bottom, b: bowed.a }, bowed, top] },
      filletCorner(bowed, top, "b", "a"),
      2,
    ).sketch;
    const before = await call(owner, { kind: "edit", sketch: fillet });
    assert.ok(before.profileEdit?.preview, before.profileEdit?.error);
    const edited = before.profileEdit.sketch;
    const moved = await call(owner, {
      kind: "preview",
      intent: { kind: "point", targets: [{ curve: bowed.id, end: "a" }] },
      sketch: {
        ...edited,
        curves: edited.curves.map((curve) =>
          curve.kind === "arc" && curve.id === bowed.id
            ? { ...curve, a: { ...curve.a, y: 1.5 } }
            : curve,
        ),
      },
    });
    assert.ok(moved.profileEdit?.draft);
    const accepted = await call(owner, { kind: "accept" });
    const preview = accepted.profileEdit?.preview;
    assert.ok(preview, accepted.profileEdit?.error);
    assert.equal(preview.faces.filter((face) => face.plane).length, 2);
    assert.ok(preview.bounds[2] > 1);
  } finally {
    owner.close();
  }
});
