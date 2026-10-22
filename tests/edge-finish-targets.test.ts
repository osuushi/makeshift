import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Edge } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { lift, prism, square, vertical } from "./body-edge-fixtures.js";

async function fit(owner: DocumentOwner, body: Body, edge: Edge, points: Vector[]) {
  const before = structuredClone(owner.view);
  const reply = await owner.call({
    kind: "edge-finish-targets",
    operation: {
      edges: [{ body: body.id, edge: edge.id }],
      mode: "fillet",
    },
    points,
  });
  assert.equal(reply.error, undefined);
  assert.deepEqual(
    owner.view,
    before,
    "target fitting never changes accepted or temporary geometry",
  );
  assert.ok(reply.edgeFinishTargets);
  return reply.edgeFinishTargets;
}

test("native fillet fitting puts the rounded surface through targets, not its tangency boundary", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const r = 3,
      inward = r * (1 - Math.SQRT1_2);
    const values = await fit(owner, body, vertical(body, 0, 0), [
      [inward, inward, 5],
      [r - r * Math.cos(Math.PI / 6), r / 2, 5],
      [0, 0, 5],
      [-2, -2, 5],
      [10, 10, 5],
    ]);
    assert.ok(Math.abs((values[0] ?? 0) - r) < 1e-5);
    assert.ok(
      Math.abs((values[1] ?? 0) - r) < 1e-5,
      "fit uses the rounded patch, not the other circle root",
    );
    assert.deepEqual(values.slice(2), [null, null, null]);
  } finally {
    owner.close();
  }
});

test("native fillet fitting follows concave rounding and circular rims", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [20, 0],
      [20, 10],
      [10, 10],
      [10, 20],
      [0, 20],
    ]);
    const delta = 2 * (1 - Math.SQRT1_2);
    const concave = await fit(owner, body, vertical(body, 10, 10), [[10 + delta, 10 + delta, 5]]);
    assert.ok(Math.abs((concave[0] ?? 0) - 2) < 1e-5);
    const cylinder = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        {
          id: "circle",
          kind: "circle",
          center: { x: 0, y: 0 },
          radius: 5,
          construction: false,
        },
      ],
    });
    const rim = cylinder.edges.find((e) => e.curve?.kind === "circle" && e.curve.center[2] === 10);
    assert.ok(rim);
    const rounded = await fit(owner, cylinder, rim, [[5 - delta, 0, 10 - delta]]);
    assert.ok(Math.abs((rounded[0] ?? 0) - 2) < 1e-5);
  } finally {
    owner.close();
  }
});
