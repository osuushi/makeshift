import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { finish } from "./body-edge-fixtures.js";
import { cap, shell } from "./shell-fixtures.js";

async function roundedCylinder(owner: DocumentOwner) {
  // Recreate the reported model: radius 20, height 32.5, bottom fillet 14.
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "circle",
        kind: "circle" as const,
        center: { x: 0, y: 0 },
        radius: 20,
        construction: false,
      },
    ],
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const reply = await owner.call({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: 32.5,
      mode: "new",
    },
  });
  assert.equal(reply.error, undefined);
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  const bottom = body.edges.find((edge) =>
    edge.points.every((v, i) => i % 3 !== 2 || Math.abs(v) < 1e-7),
  );
  assert.ok(bottom);
  const rounded = await finish(owner, body, [bottom], 14);
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  return rounded;
}

function enclosedVolume(radius: number): number {
  // Revolve r(z) = 6 + sqrt(radius² - (z - 14)²) over the quarter-circle
  // bottom, then a cylinder from z=14 to the open top at z=32.5.
  return (
    Math.PI *
    (36 * radius + 3 * Math.PI * radius ** 2 + (2 / 3) * radius ** 3 + (6 + radius) ** 2 * 18.5)
  );
}

test("spindle-torus bottom fillet shells using only its trimmed outer quarter", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundedCylinder(owner);
    const original = owner.view.data;
    const opening = cap(body, 32.5);
    assert.ok(Math.abs(body.volume - enclosedVolume(14)) < 1e-5);
    for (const thickness of [4, -4]) {
      const wall = await shell(owner, body, thickness, [opening]);
      const expected = Math.abs(enclosedVolume(14 + thickness) - enclosedVolume(14));
      assert.ok(Math.abs(wall.volume - expected) < 1e-5, `${wall.volume} vs ${expected}`);
      assert.equal(owner.view.data, original);
      for (const face of body.faces.filter((face) => face.id !== opening))
        assert.ok(wall.faces.some((retained) => retained.id === face.id));
      await owner.call({ kind: "discard" });
    }
    const rejected = await owner.call({
      kind: "shell",
      operation: { thickness: -14, selection: [{ body: body.id, faces: [opening] }] },
    });
    assert.ok(rejected.error);
    assert.equal(rejected.view.candidate, null);
    assert.equal(owner.view.data, original);
  } finally {
    owner.close();
  }
});
