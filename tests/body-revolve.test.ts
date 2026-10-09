import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Revolution } from "../src/model/body.js";
import { featureEdges } from "../src/model/feature-edges.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const near = (a: number, b: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function rectangle(x0: number, y0: number, x1: number, y1: number): Sketch {
  const points = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  return {
    ...emptySketch(planes.XZ),
    curves: points.map(([x, y], i) => ({
      id: `edge${i}`,
      kind: "segment",
      construction: false,
      a: { x, y },
      b: { x: points[(i + 1) % 4][0], y: points[(i + 1) % 4][1] },
    })),
  };
}
async function draw(owner: DocumentOwner, sketch: Sketch) {
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  return profilesFor(sketch).map((p) => ({ sketch: sketch.id, profile: p.key }));
}
async function preview(
  owner: DocumentOwner,
  sources: Revolution["sources"],
  changes: Partial<Revolution> = {},
) {
  const reply = await owner.call({
    kind: "revolve",
    revolution: {
      sources,
      axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
      angle: 360,
      height: 0,
      mode: "new",
      ...changes,
    },
  });
  assert.equal(reply.error, undefined);
  const body = reply.view.candidate?.bodies?.at(-1);
  assert.ok(body);
  let orientedVolume = 0;
  for (const face of body.faces)
    for (let i = 0; i < face.vertices.length; i += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = face.vertices.slice(i, i + 9);
      orientedVolume +=
        (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    }
  assert.ok(orientedVolume > 0, "Solid presentation must have material-outward winding");
  return body;
}

test("revolve full/partial/signed, holes and independent materialized Undo/archive", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = rectangle(5, 0, 7, 1),
      sources = await draw(owner, sketch);
    const original = owner.view.data;
    for (const angle of [360, -360, 90, -90]) {
      const body = await preview(owner, sources, { angle });
      near(body.volume, (24 * Math.PI * Math.abs(angle)) / 360);
      assert.equal(body.faces.length, Math.abs(angle) === 360 ? 4 : 6);
      if (Math.abs(angle) === 360) assert.equal(featureEdges(body).length, 4);
      assert.deepEqual(owner.view.data, original);
      if (angle === 90) {
        near(body.bounds[0], 0, 1e-5);
        near(body.bounds[1], 0, 1e-5);
        near(body.bounds[3], 7, 1e-5);
        near(body.bounds[4], 7, 1e-5);
      }
    }
    await preview(owner, sources);
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    await owner.call({ kind: "clear", sketchId: sketch.id });
    assert.deepEqual(owner.view.data.bodies, accepted.bodies);
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
    near(owner.view.data.bodies?.[0].volume ?? 0, 24 * Math.PI);
    // A shaft profile touching its axis is legal.
    const shaft = await draw(owner, rectangle(0, 0, 4, 6));
    near((await preview(owner, shaft)).volume, 96 * Math.PI);
    // Circular cross-section produces a torus, not a polygonal approximation.
    const round: Sketch = {
      ...emptySketch(planes.XZ),
      curves: [
        { id: "circle", kind: "circle", center: { x: 8, y: 0 }, radius: 1, construction: false },
      ],
    };
    near((await preview(owner, await draw(owner, round))).volume, 16 * Math.PI ** 2);
    const hole: Sketch = {
      ...rectangle(5, -2, 9, 2),
      curves: [
        ...rectangle(5, -2, 9, 2).curves,
        { id: "hole", kind: "circle", center: { x: 7, y: 0 }, radius: 1, construction: false },
      ],
    };
    const cells = await draw(owner, hole);
    const annulus = cells.find(
      (c) => profilesFor(hole).find((p) => p.key === c.profile)?.holes.length,
    );
    assert.ok(annulus);
    near((await preview(owner, [annulus])).volume, (16 - Math.PI) * 14 * Math.PI);
  } finally {
    owner.close();
  }
});

test("helical revolution uses total height, constant radial section and signed screw motion", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = await draw(owner, rectangle(5, 0, 7, 1));
    for (const angle of [720, -720, 450, -450])
      for (const height of [10, -10]) {
        const body = await preview(owner, sources, { angle, height });
        near(body.volume, (24 * Math.PI * Math.abs(angle)) / 360, 0.001);
        near(body.bounds[2], Math.min(0, height), 0.001);
        near(body.bounds[5], Math.max(1, 1 + height), 0.001);
        // End cap must be an unchanged radial section, rotated by angle and translated by total height.
        const end = body.faces.find(
          (f) =>
            f.plane &&
            f.vertices.every(
              (v, i) => i % 3 !== 2 || (v >= height - 1e-5 && v <= height + 1 + 1e-5),
            ),
        );
        assert.ok(end?.plane);
        const t = (angle * Math.PI) / 180;
        for (let i = 0; i < end.vertices.length; i += 3) {
          const x = end.vertices[i],
            y = end.vertices[i + 1];
          near(-x * Math.sin(t) + y * Math.cos(t), 0, 1e-5);
          const radial = x * Math.cos(t) + y * Math.sin(t);
          assert.ok(radial >= 5 - 1e-5 && radial <= 7 + 1e-5);
        }
      }
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    near(owner.view.data.bodies?.[0].volume ?? 0, accepted.bodies?.[0].volume ?? 0, 1e-5);
  } finally {
    owner.close();
  }
});

test("revolve rejects off-plane axes, empty angles and multiple turns without height", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = await draw(owner, rectangle(5, 0, 7, 1));
    for (const changes of [
      { angle: 0 },
      { angle: 720 },
      { height: Number.NaN },
      { axis: { origin: [0, 1, 0], direction: [0, 0, 1] } },
    ] as Partial<Revolution>[]) {
      const before = owner.view.data;
      const reply = await owner.call({
        kind: "revolve",
        revolution: {
          sources,
          axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
          angle: 360,
          height: 0,
          mode: "new",
          ...changes,
        },
      });
      assert.ok(reply.error);
      assert.equal(reply.view.candidate, null);
      assert.deepEqual(owner.view.data, before);
    }
    await preview(owner, sources, { height: 10, angle: 720 });
    await owner.call({ kind: "discard" });
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});

test("revolve Boolean defaults, explicit participants and planar result reuse", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = await draw(owner, rectangle(0, 0, 10, 5));
    const shaft = await preview(owner, sources);
    await owner.call({ kind: "accept" });
    const cut = await draw(owner, rectangle(8, 1, 12, 2));
    const grooved = await preview(owner, cut, { mode: "auto" });
    assert.equal(owner.view.booleanMode, "subtract");
    near(grooved.volume, shaft.volume - 36 * Math.PI);
    const tool = owner.view.booleanTools?.[0];
    assert.ok(tool);
    near(tool.volume, 80 * Math.PI);
    assert.ok(tool.faces.some((face) => face.vertices.length > 0));
    assert.equal("brep" in tool, false, "tool view has no exact-shape authority");
    const overlap = await preview(owner, cut, { mode: "intersect", targets: [shaft.id] });
    near(overlap.volume, 36 * Math.PI);
    assert.deepEqual(owner.view.booleanTools?.[0].bounds, tool.bounds);
    const joined = await preview(owner, cut, { mode: "union" });
    near(joined.volume, shaft.volume + 44 * Math.PI);
    assert.deepEqual(owner.view.booleanTools, []);
    const sector = await preview(owner, cut, { angle: 90 });
    await owner.call({ kind: "accept" });
    const cap = sector.faces.find((f) => f.plane && Math.abs(f.plane.v[2]) > 0.9);
    assert.ok(cap);
    const edgeAxis = await preview(owner, [{ face: cap.id }], {
      axis: { origin: [8, 0, 0], direction: [0, 0, 1] },
    });
    near(edgeAxis.volume, 16 * Math.PI);
    const reply = await owner.call({
      kind: "extrude",
      extrusion: { sources: [{ face: cap.id }], distance: 2, mode: "new" },
    });
    assert.equal(reply.error, undefined);
    const body = reply.view.candidate?.bodies?.at(-1) as Body;
    near(body.volume, 8);
  } finally {
    owner.close();
  }
});

test("mixed arcs, hollow helices and transformed axes retain radial sections", async () => {
  const owner = new DocumentOwner();
  try {
    const arc: Sketch = {
      ...emptySketch(planes.XZ),
      curves: [
        {
          id: "arc",
          kind: "arc",
          a: { x: 6, y: 0 },
          b: { x: 10, y: 0 },
          bulge: 1,
          construction: false,
        },
        { id: "line", kind: "segment", a: { x: 10, y: 0 }, b: { x: 6, y: 0 }, construction: false },
      ],
    };
    near((await preview(owner, await draw(owner, arc))).volume, 32 * Math.PI ** 2);
    const hollow: Sketch = {
      ...emptySketch(planes.XZ),
      curves: [
        { id: "outer", kind: "circle", center: { x: 8, y: 0 }, radius: 2, construction: false },
        { id: "inner", kind: "circle", center: { x: 8, y: 0 }, radius: 1, construction: false },
      ],
    };
    const sources = await draw(owner, hollow);
    const source = sources.find(
      (s) => profilesFor(hollow).find((p) => p.key === s.profile)?.holes.length,
    );
    assert.ok(source);
    const body = await preview(owner, [source], { angle: 720, height: 20 });
    near(body.volume, 96 * Math.PI ** 2, 0.01);
    const base = rectangle(5, 0, 7, 1);
    const c = Math.SQRT1_2;
    const rotated: Sketch = { ...base, plane: { origin: [12, -4, 3], u: [c, c, 0], v: [0, 0, 1] } };
    const result = await preview(owner, await draw(owner, rotated), {
      axis: { origin: [12, -4, 3], direction: [0, 0, 1] },
      angle: 90,
    });
    near(result.volume, 6 * Math.PI);
  } finally {
    owner.close();
  }
});
