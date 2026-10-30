import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { MeasurementTarget } from "../src/model/measurement.js";
import { type PlaneFrame, planes } from "../src/sketch/planes.js";
import { prism, square } from "./body-edge-fixtures.js";

const close = (actual: number | undefined, expected: number) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
async function plane(owner: DocumentOwner, id: string, frame: PlaneFrame) {
  const reply = await owner.call({ kind: "construction-plane", plane: { id, frame } });
  assert.equal(reply.error, undefined);
  return { kind: "plane" as const, plane: id };
}
async function measure(owner: DocumentOwner, targets: MeasurementTarget[]) {
  const reply = await owner.call({ kind: "measure", targets });
  assert.equal(reply.error, undefined);
  assert.ok(reply.measurement);
  return reply.measurement;
}

test("construction planes measure infinite support against faces and edges and refresh after edits", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const top = body.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-7),
    );
    const edge = body.edges.find(
      (e) => e.curve?.kind === "line" && e.curve.a[2] === 10 && e.curve.b[2] === 10,
    );
    assert.ok(top && edge);
    const reference = await plane(owner, "reference", { ...planes.XY, origin: [1e6, -1e6, 25] });
    const before = structuredClone(owner.view);
    for (const target of [
      { kind: "face" as const, body: body.id, face: top.id },
      { kind: "edge" as const, body: body.id, edge: edge.id },
    ]) {
      for (const targets of [
        [target, reference],
        [reference, target],
      ]) {
        const m = await measure(owner, targets);
        close(m.distance?.value, 15);
        close(m.minimumGap?.value, 15);
        close(m.maximumGap?.value, 15);
        close(m.properties.find((p) => p.label === "Parallel distance")?.value, 15);
        assert.equal(m.approximate, false);
      }
    }
    assert.deepEqual(owner.view, before);
    assert.deepEqual((await measure(owner, [reference])).properties, []);
    await plane(owner, "reference", { ...planes.YZ, origin: [10, 1e6, -1e6] });
    const m = await measure(owner, [reference, { kind: "face", body: body.id, face: top.id }]);
    close(m.distance?.value, 0);
    close(m.minimumGap?.value, 0);
    close(m.maximumGap?.value, 10);
    close(m.properties.find((p) => p.label === "Plane angle")?.value, 90);
    assert.equal(m.approximate, false);
    await owner.call({ kind: "undo" });
    close(
      (await measure(owner, [reference, { kind: "face", body: body.id, face: top.id }])).distance
        ?.value,
      15,
    );
    const bad = await owner.call({
      kind: "measure",
      targets: [{ kind: "plane", plane: "missing" }],
    });
    assert.ok(bad.error);
  } finally {
    owner.close();
  }
});

test("infinite plane pairs report parallel separation or intersection without fictitious finite gaps", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await plane(owner, "a", planes.XY);
    const b = await plane(owner, "b", { ...planes.XY, origin: [1e6, 0, 12] });
    const parallel = await measure(owner, [a, b]);
    close(parallel.distance?.value, 12);
    close(parallel.minimumGap?.value, 12);
    close(parallel.maximumGap?.value, 12);
    await plane(owner, "b", planes.YZ);
    const angled = await measure(owner, [a, b]);
    close(angled.distance?.value, 0);
    assert.equal(angled.maximumGap, undefined);
    assert.ok(angled.relationships.includes("Perpendicular"));
  } finally {
    owner.close();
  }
});

test("oblique plane gaps use finite profile vertices and exact intersection, curves retain approximation", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const sketch = owner.view.data.sketches[0];
    const { profilesFor } = await import("../src/sketch/profiles.js");
    const target: MeasurementTarget = {
      kind: "profile",
      sketch: sketch.id,
      profile: profilesFor(sketch)[0].key,
    };
    const root = Math.sqrt(0.5);
    const ref = await plane(owner, "oblique", {
      origin: [0, 0, 5],
      u: [root, 0, root],
      v: [0, 1, 0],
    });
    const m = await measure(owner, [target, ref]);
    close(m.distance?.value, 5 * root);
    close(m.minimumGap?.value, 5 * root);
    close(m.maximumGap?.value, 25 * root);
    assert.equal(m.approximate, false);
    const { emptySketch } = await import("../src/sketch/document.js");
    const circle = {
      ...emptySketch(planes.XY),
      curves: [
        {
          kind: "circle" as const,
          id: "circle",
          center: { x: 0, y: 0 },
          radius: 10,
          construction: false,
        },
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch: circle })).error, undefined);
    await plane(owner, "oblique", { ...planes.XY, origin: [1e6, 0, 12] });
    const curved = await measure(owner, [
      { kind: "curve", sketch: circle.id, curve: "circle" },
      ref,
    ]);
    close(curved.distance?.value, 12);
    close(curved.minimumGap?.value, 12);
    close(curved.maximumGap?.value, 12);
    assert.equal(curved.approximate, true);
    assert.equal(owner.view.data.bodies?.[0].brep, body.brep);
  } finally {
    owner.close();
  }
});
