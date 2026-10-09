import assert from "node:assert/strict";
import test from "node:test";
import { editDocument } from "../src/backend/document-edits.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { resolveOperation } from "../src/model/operation-selection.js";
import { deleteProfiles } from "../src/sketch/delete-profiles.js";
import { type Circle, emptySketch, newId, type Sketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { type Point, planes } from "../src/sketch/planes.js";
import { profileAt, profilesFor } from "../src/sketch/profiles.js";
import { validateSketch } from "../src/sketch/sketch-validation.js";

const circle = (x: number, radius = 5): Circle => ({
  id: newId(),
  kind: "circle",
  center: { x, y: 0 },
  radius,
  construction: false,
});
const circles = (): Sketch => ({ ...emptySketch(planes.XY), curves: [circle(-3), circle(3)] });
const selected = (sketch: Sketch, points: Point[]) =>
  points.map((point) => {
    const profile = profileAt(sketch, point);
    assert.ok(profile);
    return profile.key;
  });
const left = { x: -6, y: 0 },
  right = { x: 6, y: 0 },
  overlap = { x: 0, y: 0 };

for (const [label, points, area, count, enclosed] of [
  ["right crescent", [right], Math.PI * 25, 2, [true, true, false]],
  ["overlap", [overlap], 50 * Math.PI - (50 * Math.acos(0.6) - 24), 1, [true, true, true]],
  [
    "right and overlap",
    [right, overlap],
    Math.PI * 25 - (50 * Math.acos(0.6) - 24),
    1,
    [true, false, false],
  ],
  ["all regions", [left, right, overlap], 0, 0, [false, false, false]],
] as const) {
  test(`deleting ${label} preserves exactly the permitted enclosed area`, () => {
    const sketch = circles();
    const result = deleteProfiles(sketch, selected(sketch, [...points])).sketch;
    validateSketch(result);
    const profiles = profilesFor(result);
    assert.equal(profiles.length, count);
    assert.ok(Math.abs(profiles.reduce((sum, p) => sum + p.area, 0) - area) < 1e-7);
    assert.deepEqual(
      [left, overlap, right].map((p) => !!profileAt(result, p)),
      enclosed,
    );
    assert.equal(profileAt(result, { x: 0, y: 6 }), undefined);
  });
}

test("nested selections merge inward, open only selected outer regions, and preserve construction", () => {
  const construction = { ...circle(0, 10), construction: true };
  const sketch = { ...emptySketch(planes.XY), curves: [circle(0, 10), circle(0, 5), construction] };
  const inner = deleteProfiles(sketch, selected(sketch, [overlap])).sketch;
  assert.equal(profilesFor(inner).length, 1);
  assert.ok(Math.abs(profilesFor(inner)[0].area - Math.PI * 100) < 1e-7);
  assert.deepEqual(
    inner.curves.find((c) => c.id === construction.id),
    construction,
  );
  const outer = deleteProfiles(sketch, selected(sketch, [{ x: 8, y: 0 }])).sketch;
  assert.equal(profilesFor(outer).length, 1);
  assert.ok(Math.abs(profilesFor(outer)[0].area - Math.PI * 25) < 1e-7);
  assert.equal(profileAt(outer, { x: 8, y: 0 }), undefined);
});

test("long edges split at face boundaries, duplicates trim together, and free tails survive", () => {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      circle(0),
      segment({ x: -10, y: 0 }, { x: 10, y: 0 }),
      segment({ x: -10, y: 0 }, { x: 10, y: 0 }),
    ],
  };
  const result = deleteProfiles(sketch, selected(sketch, [{ x: 0, y: 2 }])).sketch;
  validateSketch(result);
  assert.equal(profilesFor(result).length, 1);
  assert.ok(Math.abs(profilesFor(result)[0].area - Math.PI * 12.5) < 1e-7);
  const lines = result.curves.filter((c) => c.kind === "segment");
  assert.equal(lines.length, 2);
  for (const line of lines)
    assert.deepEqual(
      [line.a, line.b],
      [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
    );
  const all = deleteProfiles(
    sketch,
    profilesFor(sketch).map((p) => p.key),
  ).sketch;
  assert.equal(all.curves.length, 4);
  assert.equal(profilesFor(all).length, 0);
  for (const curve of all.curves) {
    assert.equal(curve.kind, "segment");
    if (curve.kind === "segment")
      assert.ok(Math.min(Math.abs(curve.a.x), Math.abs(curve.b.x)) >= 5 - 1e-7);
  }
});

test("profile delete resolves with whole sketches and rejects stale keys atomically", () => {
  const sketch = circles(),
    document = { units: "mm" as const, sketches: [sketch] };
  const profile = profilesFor(sketch)[0];
  const target = { kind: "profile" as const, sketch: sketch.id, profile };
  const resolution = resolveOperation("delete", [target], document);
  assert.ok(resolution.available);
  assert.deepEqual(resolution.inputs.profiles, [{ sketch: sketch.id, profile: profile.key }]);
  const whole = resolveOperation(
    "delete",
    [target, { kind: "sketch", sketch: sketch.id }],
    document,
  );
  assert.ok(whole.available);
  assert.deepEqual(whole.inputs.profiles, []);
  assert.throws(
    () =>
      editDocument(document, {
        kind: "delete-entities",
        bodyIds: [],
        sketchIds: [],
        profiles: [{ sketch: sketch.id, profile: "stale" }],
      }),
    /no longer exists/,
  );
  assert.equal(document.sketches[0], sketch);
});

test("backend accepts multi-sketch profile deletion in one Undo and preserves radius relations", async () => {
  const owner = new DocumentOwner();
  try {
    const source = circles();
    const first: Sketch = {
      ...source,
      constraints: [{ id: newId(), kind: "radius", curve: source.curves[1].id, value: 5 }],
    };
    const second = circles();
    for (const sketch of [first, second]) {
      const reply = await owner.call({ kind: "edit", sketch });
      assert.equal(reply.error, undefined);
    }
    const before = owner.view.data;
    const reply = await owner.call({
      kind: "delete-entities",
      bodyIds: [],
      sketchIds: [],
      profiles: [first, second].flatMap((s) =>
        selected(s, [right]).map((profile) => ({ sketch: s.id, profile })),
      ),
    });
    assert.equal(reply.error, undefined);
    const after = owner.view.data;
    for (const sketch of after.sketches) {
      assert.equal(profileAt(sketch, right), undefined);
      assert.ok(profileAt(sketch, overlap));
    }
    assert.equal(after.sketches[0].constraints.filter((c) => c.kind === "radius").length, 1);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    const edited = await owner.call({ kind: "edit", sketch: after.sketches[0] });
    assert.equal(edited.error, undefined);
  } finally {
    owner.close();
  }
});

test("cubic boundaries and clockwise arcs use their own finite parameter domains", () => {
  const base = circle(0);
  const clockwise = {
    id: newId(),
    kind: "arc" as const,
    construction: false,
    a: { x: -5, y: 0 },
    b: { x: 5, y: 0 },
    bulge: -0.4,
  };
  const cubic = {
    id: newId(),
    kind: "bezier" as const,
    construction: false,
    a: { x: -5, y: 0 },
    b: { x: 5, y: 0 },
    c1: { x: -3, y: -4 },
    c2: { x: 3, y: -4 },
  };
  const sketch = { ...emptySketch(planes.XY), curves: [base, clockwise, cubic] };
  const point = { x: 0, y: -1 };
  const result = deleteProfiles(sketch, selected(sketch, [point])).sketch;
  validateSketch(result);
  assert.equal(profilesFor(result).length, 1);
  assert.ok(Math.abs(profilesFor(result)[0].area - Math.PI * 25) < 1e-7);
  assert.ok(profileAt(result, { x: 0, y: -4 }));
  assert.ok(profileAt(result, { x: 0, y: 4 }));
  assert.equal(
    result.curves.some((c) => c.id === cubic.id),
    false,
  );
});

test("coincident circles trim on the same locus while disjoint geometry stays unchanged", () => {
  const sketch = circles();
  const far = { ...circle(30), id: newId() };
  const duplicate = { ...sketch.curves[1], id: newId() };
  const original = { ...sketch, curves: [...sketch.curves, duplicate, far] };
  const result = deleteProfiles(original, selected(original, [right])).sketch;
  validateSketch(result);
  assert.equal(profileAt(result, right), undefined);
  assert.ok(profileAt(result, overlap));
  assert.equal(
    result.curves.find((c) => c.id === far.id),
    far,
  );
  assert.equal(result.curves.filter((c) => c.kind === "arc").length, 2);
});
