import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { projectionTarget } from "../src/backend/projection.js";
import { bezierAt } from "../src/sketch/bezier-geometry.js";
import { type Bezier, emptySketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const tilted = {
  origin: [0, 0, 5] as [number, number, number],
  u: [1, 0, 0] as [number, number, number],
  v: [0, 0.6, 0.8] as [number, number, number],
};
test("projection preserves analytics, approximates tilted circles and creates independent editable closed cubics", async () => {
  const owner = new DocumentOwner();
  try {
    const circle = {
      id: "circle",
      kind: "circle" as const,
      center: { x: 0, y: 0 },
      radius: 10,
      construction: false,
    };
    const sketch = { ...emptySketch(planes.XY), curves: [circle] };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const sources = [{ kind: "curve" as const, sketch: sketch.id, curve: circle.id }];
    const parallel = { ...planes.XY, origin: [0, 0, 8] as [number, number, number] };
    let reply = await owner.call({
      kind: "project",
      projection: { sources, frame: parallel, sketchId: "parallel" },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.candidate?.sketches.at(-1)?.curves[0].kind, "circle");
    await owner.call({ kind: "discard" });
    assert.equal(owner.view.data.sketches.length, 1);
    reply = await owner.call({
      kind: "project",
      projection: { sources, frame: planes.XZ, sketchId: "edge-on" },
    });
    assert.equal(reply.error, undefined);
    const line = reply.view.candidate?.sketches.at(-1)?.curves[0];
    assert.ok(line?.kind === "segment");
    assert.ok(Math.abs(Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) - 20) < 1e-7);
    await owner.call({ kind: "discard" });
    reply = await owner.call({
      kind: "project",
      projection: { sources, frame: tilted, sketchId: "ellipse" },
    });
    assert.equal(reply.error, undefined);
    const projected = reply.view.candidate?.sketches.at(-1);
    assert.ok(projected);
    assert.ok(projected.curves.length > 1 && projected.curves.every((c) => c.kind === "bezier"));
    for (const c of projected.curves as Bezier[])
      for (let i = 0; i <= 100; i++) {
        const p = bezierAt(c, i / 100);
        const residual = Math.abs(Math.hypot(p.x / 10, (p.y + 4) / 6) - 1);
        assert.ok(residual < 0.001 / 6, `ellipse error ${residual}`);
      }
    const profiles = profilesFor(projected);
    assert.equal(profiles.length, 1);
    assert.ok(Math.abs(profiles[0].area - 60 * Math.PI) < 0.02);
    await owner.call({ kind: "accept" });
    reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: projected.id, profile: profiles[0].key }],
        distance: 2,
        mode: "new",
      },
    });
    assert.equal(reply.error, undefined);
    assert.ok(Math.abs((reply.view.candidate?.bodies?.[0].volume ?? 0) - 120 * Math.PI) < 0.04);
    await owner.call({ kind: "discard" });
    const edited = {
      ...projected,
      curves: projected.curves.map((c, i) =>
        i === 0 && c.kind === "bezier" ? { ...c, c1: { x: c.c1.x + 1, y: c.c1.y } } : c,
      ),
    };
    assert.equal((await owner.call({ kind: "edit", sketch: edited })).error, undefined);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches.at(-1), projected);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.sketches.length, 1);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data.sketches[0], sketch);
  } finally {
    owner.close();
  }
});
test("target reuses a coplanar workspace even with different in-plane coordinates", () => {
  const sketch = { ...emptySketch(planes.XY), curves: [segment({ x: 0, y: 0 }, { x: 1, y: 0 })] };
  const target = projectionTarget(
    { units: "mm", sketches: [sketch] },
    { sources: [], frame: { origin: [3, 4, 0], u: [0, 1, 0], v: [-1, 0, 0] } },
  );
  assert.equal(target, sketch);
});

test("cut cone hyperbola and parabola edges project from exact BRep curves", async () => {
  for (const frame of [
    { origin: [5, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { origin: [0, 0, 5], u: [0, 1, 0], v: [1 / Math.sqrt(5), 0, 2 / Math.sqrt(5)] },
  ] as import("../src/sketch/planes.js").PlaneFrame[]) {
    const owner = new DocumentOwner();
    try {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 20 },
      ];
      const coneSketch = {
        ...emptySketch(planes.XZ),
        curves: points.map((p, i) => segment(p, points[(i + 1) % 3])),
      };
      assert.equal((await owner.call({ kind: "edit", sketch: coneSketch })).error, undefined);
      assert.equal(
        (
          await owner.call({
            kind: "revolve",
            revolution: {
              sources: [{ sketch: coneSketch.id, profile: profilesFor(coneSketch)[0].key }],
              axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
              angle: 360,
              height: 0,
              mode: "new",
            },
          })
        ).error,
        undefined,
      );
      await owner.call({ kind: "accept" });
      const corners = [
        { x: -30, y: -30 },
        { x: 30, y: -30 },
        { x: 30, y: 40 },
        { x: -30, y: 40 },
      ];
      const cutter = {
        ...emptySketch(frame),
        curves: corners.map((p, i) => segment(p, corners[(i + 1) % 4])),
      };
      assert.equal((await owner.call({ kind: "edit", sketch: cutter })).error, undefined);
      const cut = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: cutter.id, profile: profilesFor(cutter)[0].key }],
          distance: 50,
          mode: "subtract",
        },
      });
      assert.equal(cut.error, undefined);
      await owner.call({ kind: "accept" });
      const body = owner.view.data.bodies?.[0];
      assert.ok(body);
      // Null analytic metadata also represents the cone's degenerate apex.
      // The signature's exact linear measure distinguishes spatial conics.
      const conics = body.edges.filter((e) => !e.curve && e.signature[2] > 1e-7);
      assert.ok(conics.length, "cone cut creates non-circular conic edges");
      const projected = await owner.call({
        kind: "project",
        projection: {
          sources: conics.map((e) => ({ kind: "edge", body: body.id, edge: e.id })),
          frame,
          sketchId: "conic",
        },
      });
      assert.equal(projected.error, undefined);
      const curves = projected.view.candidate?.sketches.find((s) => s.id === "conic")?.curves;
      assert.ok(curves?.length);
      for (const c of curves) {
        assert.equal(c.kind, "bezier");
        for (let i = 0; i <= 80; i++) {
          const p = bezierAt(c as Bezier, i / 80);
          const xyz = frame.origin.map((v, j) => v + frame.u[j] * p.x + frame.v[j] * p.y);
          assert.ok(
            Math.abs(Math.hypot(xyz[0], xyz[1]) - (10 - xyz[2] / 2)) < 0.0015,
            "projected conic stays on cone within fitting budget",
          );
        }
      }
    } finally {
      owner.close();
    }
  }
});

test("projected face sets omit internal shared edges and retain explicit edge selections", async () => {
  const { prism, square } = await import("./body-edge-fixtures.js");
  const { projectionCurves } = await import("../src/model/projection.js");
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square),
      first = body.faces[0];
    const second = body.faces.find(
      (f) => f.id !== first.id && f.edges.some((id) => first.edges.includes(id)),
    );
    assert.ok(second);
    const shared = first.edges.filter((id) => second.edges.includes(id));
    assert.equal(shared.length, 1);
    const sources = [first, second].map((f) => ({
      kind: "face" as const,
      body: body.id,
      face: f.id,
    }));
    const edges = projectionCurves(owner.view.data, sources);
    assert.equal(edges.length, 6);
    assert.ok(edges.every((e) => e.kind === "edge" && !shared.includes(e.edge)));
    assert.equal(
      projectionCurves(owner.view.data, [
        ...sources,
        { kind: "edge", body: body.id, edge: shared[0] },
      ]).length,
      7,
    );
    const reply = await owner.call({
      kind: "project",
      projection: {
        sources,
        frame: {
          origin: [0, 0, 0],
          u: [Math.SQRT1_2, -Math.SQRT1_2, 0],
          v: [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)],
        },
        sketchId: "boundary",
      },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.candidate?.sketches.at(-1)?.curves.length, 6);
  } finally {
    owner.close();
  }
});
