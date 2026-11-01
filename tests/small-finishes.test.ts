import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { EdgeSizeLimit } from "../src/backend/edge-size-limit.js";
import { materialize } from "../src/backend/kernel-result.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Body } from "../src/model/body.js";
import { minimumFinishMm } from "../src/model/geometry-policy.js";
import { OffsetQuantity } from "../src/model/offset-quantity.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { roundedFixture } from "./body-blend-fixtures.js";
import { finish, lift, prism, square, vertical } from "./body-edge-fixtures.js";

const captured: SketchDocument = JSON.parse(
  readFileSync("tests/fixtures/microscopic-finishes.json", "utf8"),
);

function meaningfulFinishes(body: Body) {
  for (const face of body.faces) {
    if (face.blend) assert.ok(face.blend.radius >= minimumFinishMm - 1e-9);
    if (face.chamfer) assert.ok(face.chamfer.distance >= minimumFinishMm - 1e-9);
  }
}

for (const mode of ["fillet", "chamfer"] as const)
  test(`captured microscopic rounds reopen as sharp edges that accept ${mode}`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "open", document: captured })).error, undefined);
      const original = owner.view.data;
      const body = original.bodies?.[0];
      assert.ok(body);
      assert.equal(body.id, captured.bodies?.[0].id);
      assert.equal(body.faces.length, 18);
      meaningfulFinishes(body);
      assert.ok(Math.abs(body.volume - (captured.bodies?.[0].volume ?? 0)) < 0.001);
      assert.ok(body.faces.some((f) => f.blend?.radius === 12));
      const edges = body.edges.filter(
        (e) =>
          e.curve?.kind === "line" &&
          Math.abs(e.curve.a[0] - e.curve.b[0]) > 159 &&
          Math.abs(e.curve.a[1] - 200.9993896484375) < 1e-7,
      );
      assert.equal(edges.length, 2);
      const selection = edges.map((edge) => ({ body: body.id, edge: edge.id }));
      const chain = await owner.call({
        kind: "edge-finish-selection",
        operation: { edges: selection, mode },
      });
      assert.equal(chain.error, undefined);
      const reply = await owner.call({
        kind: "finish-edges",
        operation: { edges: selection, mode, size: 1 },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.edgeSize, 1);
      const candidate = reply.view.candidate?.bodies?.[0];
      assert.ok(candidate && candidate.volume < body.volume);
      meaningfulFinishes(candidate);
      assert.equal(owner.view.data, original);
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, original);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      const reopened = owner.view.data.bodies?.[0];
      assert.ok(reopened);
      assert.equal(reopened.id, candidate.id);
      assert.deepEqual(
        reopened.faces.map((f) => f.id),
        candidate.faces.map((f) => f.id),
      );
      assert.deepEqual(
        reopened.edges.map((e) => e.id),
        candidate.edges.map((e) => e.id),
      );
      assert.ok(Math.abs(reopened.volume - candidate.volume) < 1e-7);
      for (const [i, bound] of candidate.bounds.entries())
        assert.ok(Math.abs(reopened.bounds[i] - bound) < 1e-7);
    } finally {
      owner.close();
    }
  });

test("normal offset's feasibility boundary cannot publish a microscopic fillet", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    await finish(owner, box, [vertical(box, 0, 0)], 5);
    await owner.call({ kind: "accept" });
    const before = owner.view.data;
    const body = before.bodies?.[0];
    assert.ok(body);
    const wall = body.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 0 || Math.abs(v) < 1e-7),
    );
    assert.ok(wall);
    const reply = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: body.id, face: wall.id }], distance: -5 },
    });
    assert.equal(reply.error, undefined);
    const candidate = reply.view.candidate?.bodies?.[0];
    assert.ok(candidate);
    meaningfulFinishes(candidate);
    assert.equal(candidate.faces.length, 6);
    assert.ok(candidate.faces.some((f) => f.id === wall.id));
    assert.ok(Math.abs(candidate.volume - 2250) < 1);
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
  } finally {
    owner.close();
  }
});

for (const mode of ["fillet", "chamfer"] as const)
  test(`shared native result normalization heals small ${mode}s and preserves larger ones`, async () => {
    const owner = new DocumentOwner();
    const kernel = new SolidCalculator();
    try {
      const box = await prism(owner, square);
      for (const size of [10 / 16384, 0.002]) {
        // Exercise the common native result boundary, bypassing UI size snapping.
        const result = await kernel.calculate({
          kind: "edge-finish",
          bodies: [box],
          edges: [{ body: box.id, edge: vertical(box, 0, 0).id }],
          mode,
          size,
        });
        const body = materialize([box], result)[0];
        assert.ok(body);
        meaningfulFinishes(body);
        assert.equal(body.faces.length, size < minimumFinishMm ? 6 : 7);
        if (size < minimumFinishMm) assert.ok(Math.abs(body.volume - box.volume) < 1e-6);
      }
    } finally {
      kernel.close();
      owner.close();
    }
  });

test("joint simplification handles concave edges, circular rims and meeting corner caps", async () => {
  const owner = new DocumentOwner();
  const kernel = new SolidCalculator();
  try {
    for (const type of ["concave", "rim", "corner"] as const) {
      const body =
        type === "rim"
          ? await lift(owner, {
              ...emptySketch(planes.XY),
              curves: [
                {
                  id: "circle",
                  kind: "circle",
                  center: { x: 0, y: 0 },
                  radius: 8,
                  construction: false,
                },
              ],
            })
          : await prism(
              owner,
              type === "concave"
                ? [
                    [0, 0],
                    [20, 0],
                    [20, 10],
                    [10, 10],
                    [10, 20],
                    [0, 20],
                  ]
                : square,
            );
      const edges =
        type === "rim"
          ? body.edges.filter((e) => e.curve?.kind === "circle" && e.points[2] > 9)
          : type === "corner"
            ? body.edges.filter(
                (e) =>
                  e.curve?.kind === "line" &&
                  [e.curve.a, e.curve.b].some((p) => p.every((v) => Math.abs(v) < 1e-7)),
              )
            : [vertical(body, 10, 10)];
      for (const mode of ["fillet", "chamfer"] as const) {
        const result = await kernel.calculate({
          kind: "edge-finish",
          bodies: [body],
          edges: edges.map((e) => ({ body: body.id, edge: e.id })),
          mode,
          size: 10 / 16384,
        });
        assert.equal(result.results[0].faces.length, body.faces.length, `${type} ${mode}`);
        assert.ok(Math.abs(result.results[0].volume - body.volume) < 1e-6);
      }
    }
  } finally {
    kernel.close();
    owner.close();
  }
});

test("resizing a recognized round below modeling resolution heals it to zero", async () => {
  const owner = new DocumentOwner();
  try {
    await roundedFixture(owner, "convex");
    const original = owner.view.data;
    const body = original.bodies?.[0];
    const round = body?.faces.find((f) => f.blend);
    assert.ok(body && round);
    const reply = await owner.call({
      kind: "offset-faces",
      operation: {
        faces: [{ body: body.id, face: round.id }],
        radius: 0.0006,
        distance: 0,
      },
    });
    assert.equal(reply.error, undefined);
    const candidate = reply.view.candidate?.bodies?.[0];
    assert.ok(candidate);
    assert.equal(candidate.faces.length, 6);
    assert.ok(Math.abs(candidate.volume - 4000) < 1e-6);
    assert.equal(owner.view.data, original);
  } finally {
    owner.close();
  }
});

test("reopening continues saved tags through a microscopic finish's removal", async () => {
  const owner = new DocumentOwner();
  try {
    const body = captured.bodies?.[0];
    const removed = body?.faces.find((f) => f.blend && f.blend.radius < minimumFinishMm);
    const retained = body?.faces.find((f) => f.blend?.radius === 12);
    assert.ok(body && removed && retained);
    const source = {
      ...captured,
      taggedGroups: [removed, retained].map((face, i) => ({
        id: `saved-tag-${i}`,
        name: `Saved ${i}`,
        body: body.id,
        members: [{ kind: "face" as const, id: face.id }],
        problems: [],
      })),
    };
    assert.equal((await owner.call({ kind: "open", document: source })).error, undefined);
    const tags = owner.view.data.taggedGroups;
    assert.equal(tags?.[0].members.length, 0);
    assert.deepEqual(tags?.[0].problems, ["lost"]);
    assert.deepEqual(tags?.[1], source.taggedGroups[1]);
  } finally {
    owner.close();
  }
});

test("sub-resolution entry avoids native probes and finish dragging snaps to its zero endpoint", async () => {
  const limit = new EdgeSizeLimit<number>();
  const document: SketchDocument = { units: "mm", sketches: [] };
  const result = await limit.calculate(
    document,
    { edges: [], mode: "fillet", size: 0.0006 },
    async () => assert.fail("A sub-resolution size must not invoke the kernel"),
  );
  assert.deepEqual(result, { size: 0, result: null });
  for (const chamfer of [false, true]) {
    const quantity = new OffsetQuantity();
    quantity.configure([], [], { radius: 2, outward: 1, faces: [], chamfer, distanceScale: 1 });
    assert.equal(quantity.clamp(2 - 0.0006), 2);
    assert.equal(quantity.finishInput(quantity.clamp(2 - 0.0006)).radius, 0);
    assert.equal(quantity.clamp(2 - 0.002), 2 - 0.002);
  }
});
